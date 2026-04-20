import json
import xml.etree.ElementTree as ET
from pathlib import Path
from app.config import settings


def _safe_path(path: str) -> Path:
    """Resolve path within workspace, blocking traversal attacks."""
    workspace = settings.workspace_path
    workspace.mkdir(parents=True, exist_ok=True)
    resolved = (workspace / Path(path).name).resolve()
    if not str(resolved).startswith(str(workspace)):
        raise ValueError(f"Path traversal detected: {path}")
    return resolved


def read_file(path: str) -> str:
    target = _safe_path(path)
    if not target.exists():
        raise FileNotFoundError(f"File not found: {path}")
    return target.read_text(encoding="utf-8")


def write_file(path: str, content: str) -> str:
    target = _safe_path(path)
    target.write_text(content, encoding="utf-8")
    return f"File written: {target.name}"


def delete_file(path: str) -> str:
    target = _safe_path(path)
    if not target.exists():
        raise FileNotFoundError(f"File not found: {path}")
    target.unlink()
    return f"File deleted: {target.name}"


def list_files() -> list[str]:
    workspace = settings.workspace_path
    workspace.mkdir(parents=True, exist_ok=True)
    return sorted(f.name for f in workspace.iterdir() if f.is_file())


def validate_xml(path: str) -> dict:
    target = _safe_path(path)
    if not target.exists():
        return {"valid": False, "error": f"File not found: {path}"}
    try:
        ET.parse(str(target))
        return {"valid": True}
    except ET.ParseError as e:
        return {"valid": False, "error": str(e)}


TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "ReadFile",
            "description": "Read the content of a file from the workspace directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File name to read from workspace"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "WriteFile",
            "description": "Write content to a file in the workspace directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File name to write in workspace"},
                    "content": {"type": "string", "description": "Content to write to the file"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "DeleteFile",
            "description": "Delete a file from the workspace directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File name to delete from workspace"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ListFiles",
            "description": "List all files currently in the workspace directory.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ValidateXML",
            "description": "Validate the XML syntax of a file in the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File name to validate"},
                },
                "required": ["path"],
            },
        },
    },
]


def execute_tool(name: str, args: dict) -> str:
    if name == "ReadFile":
        return read_file(args["path"])
    elif name == "WriteFile":
        return write_file(args["path"], args["content"])
    elif name == "DeleteFile":
        return delete_file(args["path"])
    elif name == "ListFiles":
        files = list_files()
        return json.dumps(files)
    elif name == "ValidateXML":
        result = validate_xml(args["path"])
        return json.dumps(result)
    else:
        raise ValueError(f"Unknown tool: {name}")
