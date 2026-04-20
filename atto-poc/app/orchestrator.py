import json
import re
import logging
import xml.etree.ElementTree as ET
from pathlib import Path

import litellm

from app.config import settings
from app.models import GenerateRequest, GenerateResponse, TestCase
from app.prompts import build_system_prompt, build_user_prompt
from app.tools import TOOL_DEFINITIONS, execute_tool, read_file, list_files
from app.hooks import post_write_hook, pre_delete_hook, HookError
from app.tracer import PortkeyTracer

logger = logging.getLogger(__name__)

litellm.drop_params = True


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


async def run_orchestrator(request: GenerateRequest) -> GenerateResponse:
    tracer = PortkeyTracer(trace_id=request.conversation_id)

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

    while iteration < settings.max_iterations:
        iteration += 1
        logger.info(f"[{request.conversation_id}] Iteration {iteration}")

        try:
            response = await litellm.acompletion(
                model=settings.default_model,
                messages=messages,
                tools=TOOL_DEFINITIONS,
                tool_choice="auto",
                api_base=settings.openrouter_api_base,
                api_key=settings.openrouter_api_key,
            )
        except Exception as primary_err:
            logger.warning(f"Primary model failed: {primary_err}. Trying fallback.")
            try:
                response = await litellm.acompletion(
                    model=settings.fallback_model,
                    messages=messages,
                    tools=TOOL_DEFINITIONS,
                    tool_choice="auto",
                    api_base=settings.openrouter_api_base,
                    api_key=settings.openrouter_api_key,
                )
            except Exception as fallback_err:
                raise RuntimeError(f"Both models failed. Primary: {primary_err}. Fallback: {fallback_err}")

        tracer.log_llm_call(
            model=settings.default_model,
            messages=messages,
            response=response,
        )

        choice = response.choices[0]
        assistant_message = choice.message

        # Append assistant turn to conversation
        messages.append({"role": "assistant", "content": assistant_message.content, "tool_calls": getattr(assistant_message, "tool_calls", None)})

        # No tool calls → LLM is done
        if not getattr(assistant_message, "tool_calls", None):
            final_text = assistant_message.content or ""
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
            )

        # Execute each tool call
        tool_results = []
        hook_error: str | None = None

        for tool_call in assistant_message.tool_calls:
            total_tool_calls += 1
            tool_name = tool_call.function.name
            try:
                args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                args = {}

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
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": tool_name,
                    "content": result,
                })

            except HookError as he:
                hook_error = str(he)
                tool_results.append({
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": tool_name,
                    "content": f"ERROR: {hook_error}",
                })
                break  # Stop processing further tool calls in this batch

            except Exception as e:
                err_msg = f"Tool execution error: {e}"
                tool_results.append({
                    "tool_call_id": tool_call.id,
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
    )
