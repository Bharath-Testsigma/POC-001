from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    helicone_gateway_url: str = "http://localhost:8080/ai"
    helicone_api_key: str = "placeholder-api-key"
    portkey_api_key: str = ""
    default_model: str = "google/gemini-2.5-flash"
    fallback_model: str = "openai/gpt-4o-mini"
    workspace_dir: str = "workspace"
    max_iterations: int = 20
    max_retries: int = 3

    @property
    def workspace_path(self) -> Path:
        return Path(self.workspace_dir).resolve()


settings = Settings()
