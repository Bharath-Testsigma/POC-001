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


def _provider_key(model: str) -> str:
    """Return the correct upstream API key based on model prefix."""
    m = model.lower()
    if m.startswith("anthropic/") or "claude" in m:
        return settings.anthropic_api_key
    if m.startswith("google/") or "gemini" in m:
        return settings.google_api_key
    return settings.openai_api_key  # openai/ prefix or gpt-* fallback


async def _chat_completion(
    client: httpx.AsyncClient,
    model: str,
    messages: list[dict],
) -> dict:
    response = await client.post(
        f"{settings.helicone_gateway_url.rstrip('/')}/chat/completions",
        headers={
            "Authorization": f"Bearer {_provider_key(model)}",
            "Helicone-Auth": f"Bearer {settings.helicone_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": messages,
            "tools": TOOL_DEFINITIONS,
            "tool_choice": "auto",
        },
    )
    response.raise_for_status()
    return response.json()


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
