from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    openrouter_api_key: str = ""
    portkey_api_key: str = ""
    default_model: str = "openrouter/google/gemini-flash-1.5"
    fallback_model: str = "openrouter/anthropic/claude-3-haiku"
    openrouter_api_base: str = "https://openrouter.ai/api/v1"
    workspace_dir: str = "workspace"
    max_iterations: int = 20
    max_retries: int = 3

    @property
    def workspace_path(self) -> Path:
        return Path(self.workspace_dir).resolve()


settings = Settings()
