from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    litellm_proxy_url: str = "http://localhost:4000"
    litellm_master_key: str = "sk-atto-local"
    portkey_api_key: str = ""
    default_model: str = "openai/gemini-flash"
    fallback_model: str = "openai/claude-haiku"
    workspace_dir: str = "workspace"
    max_iterations: int = 20
    max_retries: int = 3

    @property
    def workspace_path(self) -> Path:
        return Path(self.workspace_dir).resolve()


settings = Settings()
