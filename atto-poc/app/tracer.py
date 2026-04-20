import uuid
import logging
from typing import Any
from app.config import settings

logger = logging.getLogger(__name__)


class PortkeyTracer:
    """Logs LLM calls and tool usage to Portkey for observability."""

    def __init__(self, trace_id: str):
        self.trace_id = trace_id
        self._client = None
        self._enabled = bool(settings.portkey_api_key)

        if self._enabled:
            try:
                from portkey_ai import Portkey
                self._client = Portkey(api_key=settings.portkey_api_key)
            except Exception as e:
                logger.warning(f"Portkey init failed, tracing disabled: {e}")
                self._enabled = False

    def log_llm_call(
        self,
        model: str,
        messages: list[dict],
        response: Any,
        span_name: str = "llm:call",
    ) -> None:
        span_id = str(uuid.uuid4())
        usage = {}
        if hasattr(response, "usage") and response.usage:
            usage = {
                "prompt_tokens": getattr(response.usage, "prompt_tokens", 0),
                "completion_tokens": getattr(response.usage, "completion_tokens", 0),
                "total_tokens": getattr(response.usage, "total_tokens", 0),
            }

        log_entry = {
            "trace_id": self.trace_id,
            "span_id": span_id,
            "span_name": span_name,
            "model": model,
            "usage": usage,
        }
        logger.info(f"[TRACE] {log_entry}")

        if self._enabled and self._client:
            try:
                self._client.logger.log(
                    trace_id=self.trace_id,
                    span_id=span_id,
                    span_name=span_name,
                    request={"model": model, "messages": messages},
                    response={"usage": usage},
                )
            except Exception as e:
                logger.debug(f"Portkey log failed (non-fatal): {e}")

    def log_tool_call(self, tool_name: str, args: dict, result: str) -> None:
        span_id = str(uuid.uuid4())
        log_entry = {
            "trace_id": self.trace_id,
            "span_id": span_id,
            "span_name": f"tool:{tool_name}",
            "args": args,
            "result_preview": result[:200] if isinstance(result, str) else str(result)[:200],
        }
        logger.info(f"[TRACE] {log_entry}")

        if self._enabled and self._client:
            try:
                self._client.logger.log(
                    trace_id=self.trace_id,
                    span_id=span_id,
                    span_name=f"tool:{tool_name}",
                    request={"tool": tool_name, "args": args},
                    response={"result": result[:500] if isinstance(result, str) else str(result)[:500]},
                )
            except Exception as e:
                logger.debug(f"Portkey tool log failed (non-fatal): {e}")
