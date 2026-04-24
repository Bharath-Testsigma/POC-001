from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    bifrost_url: str = "http://localhost:8080"
    default_model: str = "openai/gpt-4o-mini"
    fallback_model: str = "anthropic/claude-haiku-4-5-20251001"
    workspace_dir: str = "workspace"
    max_iterations: int = 20
    max_retries: int = 3

    @property
    def workspace_path(self) -> Path:
        return Path(self.workspace_dir).resolve()


settings = Settings()
