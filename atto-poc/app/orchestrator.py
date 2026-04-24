import json
import re
import logging
import xml.etree.ElementTree as ET
from pathlib import Path

import httpx

from app.config import settings
from app.models import GenerateRequest, GenerateResponse, TestCase
from app.prompts import build_system_prompt, build_user_prompt
from app.tools import TOOL_DEFINITIONS, execute_tool, read_file, list_files
from app.hooks import post_write_hook, pre_delete_hook, HookError
from app.tracer import PortkeyTracer

logger = logging.getLogger(__name__)


def _parse_output_block(text: str) -> dict:
    """Extract workflow_type and summary from <output>...</output> block."""
    match = re.search(r"<output>(.*?)</output>", text, re.DOTALL | re.IGNORECASE)
    if not match:
        return {"workflow_type": "GENERATION", "summary": text.strip()}

    block = match.group(1).strip()
    result = {}
    for line in block.splitlines():
        line = line.strip()
        if ":" in line:
            key, _, value = line.partition(":")
            result[key.strip().lower()] = value.strip()

    return {
        "workflow_type": result.get("workflow_type", "GENERATION").upper(),
        "summary": result.get("summary", block),
    }


def _extract_title_from_xml(content: str) -> str:
    """Parse title from XML test case content."""
    try:
        root = ET.fromstring(content)
        title_el = root.find("title")
        if title_el is not None and title_el.text:
            return title_el.text.strip()
    except ET.ParseError:
        pass
    return "Untitled Test Case"


def _collect_test_cases(written_files: set[str]) -> list[TestCase]:
    """Read all written XML files and build TestCase objects."""
    test_cases = []
    for file_name in sorted(written_files):
        try:
            content = read_file(file_name)
            title = _extract_title_from_xml(content)
            test_cases.append(TestCase(file_name=file_name, title=title, content=content))
        except Exception as e:
            logger.warning(f"Could not read written file {file_name}: {e}")
    return test_cases


def _coerce_text(content: object) -> str:
    """Normalize gateway message content to plain text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
        return "".join(parts)
    return ""


def _to_anthropic_messages(messages: list[dict]) -> list[dict]:
    """Convert an OpenAI-style message list to Anthropic format, skipping system."""
    out = []
    for m in messages:
        role = m.get("role")
        if role == "system":
            continue
        if role == "tool":
            # OpenAI tool result → Anthropic tool_result content block inside a user turn
            out.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": m.get("tool_call_id", ""),
                    "content": m.get("content", ""),
                }],
            })
        elif role == "assistant" and m.get("tool_calls"):
            # OpenAI assistant with tool_calls → Anthropic tool_use content blocks
            content = []
            if m.get("content"):
                content.append({"type": "text", "text": m["content"]})
            for tc in m["tool_calls"]:
                args = tc["function"].get("arguments", "{}")
                content.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["function"]["name"],
                    "input": json.loads(args) if isinstance(args, str) else args,
                })
            out.append({"role": "assistant", "content": content})
        else:
            out.append({"role": role, "content": m.get("content", "")})
    return out


def _route(model: str) -> str:
    """Return provider family: openai | anthropic | google."""
    m = model.lower()
    if m.startswith("anthropic/") or "claude" in m:
        return "anthropic"
    if m.startswith("google/") or "gemini" in m:
        return "google"
    return "openai"


async def _chat_completion(
    client: httpx.AsyncClient,
    model: str,
    messages: list[dict],
) -> dict:
    provider = _route(model)

    if provider == "openai":
        # Route through Helicone gateway (OpenAI-compatible)
        response = await client.post(
            f"{settings.helicone_gateway_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Helicone-Auth": f"Bearer {settings.helicone_api_key}",
                "Content-Type": "application/json",
            },
            json={"model": model, "messages": messages, "tools": TOOL_DEFINITIONS, "tool_choice": "auto"},
        )
        response.raise_for_status()
        return response.json()

    if provider == "anthropic":
        # Direct Anthropic messages API — gateway doesn't support Anthropic yet
        model_id = model.removeprefix("anthropic/")
        anthropic_messages = _to_anthropic_messages(messages)
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": model_id,
                "max_tokens": 8192,
                "system": next((m["content"] for m in messages if m["role"] == "system"), ""),
                "messages": anthropic_messages,
                "tools": [
                    {
                        "name": t["function"]["name"],
                        "description": t["function"].get("description", ""),
                        "input_schema": t["function"].get("parameters", {}),
                    }
                    for t in TOOL_DEFINITIONS
                ],
            },
        )
        if not response.is_success:
            logger.error(f"Anthropic API error {response.status_code}: {response.text}")
        response.raise_for_status()
        return _anthropic_to_openai(response.json(), model_id)

    # Google — OpenAI-compatible endpoint
    model_id = model.removeprefix("google/")
    response = await client.post(
        f"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.google_api_key}",
            "Content-Type": "application/json",
        },
        json={"model": model_id, "messages": messages, "tools": TOOL_DEFINITIONS, "tool_choice": "auto"},
    )
    response.raise_for_status()
    return response.json()


def _anthropic_to_openai(resp: dict, model_id: str) -> dict:
    """Normalise Anthropic /v1/messages response to OpenAI chat completions shape."""
    content_blocks = resp.get("content", [])
    text = " ".join(b.get("text", "") for b in content_blocks if b.get("type") == "text")
    tool_calls = [
        {
            "id": b.get("id", ""),
            "type": "function",
            "function": {"name": b["name"], "arguments": json.dumps(b.get("input", {}))},
        }
        for b in content_blocks if b.get("type") == "tool_use"
    ]
    stop_reason = resp.get("stop_reason", "end_turn")
    finish_reason = "tool_calls" if tool_calls else ("stop" if stop_reason == "end_turn" else stop_reason)
    return {
        "id": resp.get("id", ""),
        "model": model_id,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": text or None,
                    **({"tool_calls": tool_calls} if tool_calls else {}),
                },
                "finish_reason": finish_reason,
            }
        ],
        "usage": {
            "prompt_tokens": resp.get("usage", {}).get("input_tokens", 0),
            "completion_tokens": resp.get("usage", {}).get("output_tokens", 0),
        },
    }


async def run_orchestrator(request: GenerateRequest) -> GenerateResponse:
    tracer = PortkeyTracer(trace_id=request.conversation_id)

    # Per-request model override (from UI model selector)
    active_model = request.model or settings.default_model

    system_prompt = build_system_prompt(request.app_type, request.existing_files)
    user_message = build_user_prompt(request.query)

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    total_tool_calls = 0
    total_retries = 0
    written_files: set[str] = set()
    iteration = 0

    async with httpx.AsyncClient(timeout=180) as client:
        while iteration < settings.max_iterations:
            iteration += 1
            logger.info(f"[{request.conversation_id}] Iteration {iteration} model={active_model}")

            try:
                response = await _chat_completion(client, active_model, messages)
            except Exception as primary_err:
                logger.warning(f"Model {active_model} failed: {primary_err}. Trying fallback.")
                try:
                    response = await _chat_completion(client, settings.fallback_model, messages)
                    active_model = settings.fallback_model
                except Exception as fallback_err:
                    raise RuntimeError(f"Both models failed. Primary: {primary_err}. Fallback: {fallback_err}")

            tracer.log_llm_call(
                model=active_model,
                messages=messages,
                response=response,
            )

            choice = response["choices"][0]
            assistant_message = choice["message"]
            tool_calls = assistant_message.get("tool_calls") or []

            # Append assistant turn to conversation
            messages.append(
                {
                    "role": "assistant",
                    "content": assistant_message.get("content"),
                    **({"tool_calls": tool_calls} if tool_calls else {}),
                }
            )

            # No tool calls -> LLM is done
            if not tool_calls:
                final_text = _coerce_text(assistant_message.get("content"))
                parsed = _parse_output_block(final_text)
                test_cases = _collect_test_cases(written_files)
                return GenerateResponse(
                    conversation_id=request.conversation_id,
                    workflow_type=parsed["workflow_type"],
                    answer=parsed["summary"] if parsed["workflow_type"] == "QUESTION" else None,
                    test_cases=test_cases,
                    summary=parsed["summary"],
                    tool_calls_made=total_tool_calls,
                    retries=total_retries,
                    model_used=active_model,
                )

            # Execute each tool call
            tool_results = []
            hook_error: str | None = None

            for tool_call in tool_calls:
                total_tool_calls += 1
                tool_name = tool_call["function"]["name"]
                raw_args = tool_call["function"].get("arguments", "{}")
                try:
                    args = json.loads(raw_args)
                except json.JSONDecodeError as parse_err:
                    logger.warning(
                        f"[{request.conversation_id}] Could not parse args for tool '{tool_name}': {parse_err} "
                        f"| raw='{raw_args[:200]}'"
                    )
                    tool_results.append({
                        "tool_call_id": tool_call["id"],
                        "role": "tool",
                        "name": tool_name,
                        "content": f"ERROR: Model sent malformed JSON arguments for tool '{tool_name}': {parse_err}",
                    })
                    continue

                tracer.log_tool_call(tool_name, args, "")

                try:
                    # Pre-hooks
                    if tool_name == "DeleteFile":
                        pre_delete_hook(args.get("path", ""), request.existing_files)

                    result = execute_tool(tool_name, args)

                    # Post-hooks
                    if tool_name == "WriteFile":
                        post_write_hook(args["path"], args["content"])
                        written_files.add(Path(args["path"]).name)

                    tracer.log_tool_call(tool_name, args, result)
                    tool_results.append({
                        "tool_call_id": tool_call["id"],
                        "role": "tool",
                        "name": tool_name,
                        "content": result,
                    })

                except HookError as he:
                    hook_error = str(he)
                    tool_results.append({
                        "tool_call_id": tool_call["id"],
                        "role": "tool",
                        "name": tool_name,
                        "content": f"ERROR: {hook_error}",
                    })
                    break  # Stop processing further tool calls in this batch

                except Exception as e:
                    err_msg = f"Tool execution error: {e}"
                    tool_results.append({
                        "tool_call_id": tool_call["id"],
                        "role": "tool",
                        "name": tool_name,
                        "content": err_msg,
                    })

            messages.extend(tool_results)

            # If a hook error occurred, inject a retry instruction
            if hook_error and total_retries < settings.max_retries:
                total_retries += 1
                messages.append({
                    "role": "user",
                    "content": (
                        f"A validation error occurred: {hook_error} "
                        f"Please fix the issue and try again. "
                        f"Retry {total_retries}/{settings.max_retries}."
                    ),
                })

    # Exceeded max iterations — return whatever was collected
    logger.warning(f"[{request.conversation_id}] Max iterations reached.")
    test_cases = _collect_test_cases(written_files)
    return GenerateResponse(
        conversation_id=request.conversation_id,
        workflow_type="GENERATION",
        test_cases=test_cases,
        summary="Max iterations reached. Partial results returned.",
        tool_calls_made=total_tool_calls,
        retries=total_retries,
        model_used=active_model,
    )
