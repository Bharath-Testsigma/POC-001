from app.tools import validate_xml


class HookError(Exception):
    """Raised when a hook blocks an operation."""
    pass


def post_write_hook(path: str, content: str) -> None:
    """Validate XML after every WriteFile call."""
    result = validate_xml(path)
    if not result["valid"]:
        raise HookError(
            f"XML validation failed for '{path}': {result['error']}. "
            "Please fix the XML and rewrite the file."
        )


def pre_delete_hook(path: str, existing_files: list[str]) -> None:
    """Block deletion of files that existed before this session."""
    file_name = path.split("/")[-1]
    if file_name in existing_files or path in existing_files:
        raise HookError(
            f"Cannot delete '{path}': this file existed before the current session. "
            "Only files created in this session may be deleted."
        )
