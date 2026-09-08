import os
import re
from dataclasses import dataclass
from pathlib import Path


EXTENSION_ORIGIN = re.compile(r"^chrome-extension://[a-p]{32}$")


@dataclass(frozen=True)
class Settings:
    token: str
    extension_origin: str
    port: int = 8765
    max_body_bytes: int = 3 * 1024 * 1024
    database_path: Path = Path("agent-data/jobfilter.sqlite3")
    agent_model: str = "alibaba:qwen3.7-plus"

    def __post_init__(self) -> None:
        if len(self.token) < 32:
            raise ValueError("JOBFILTER_AGENT_TOKEN must contain at least 32 characters")
        if not EXTENSION_ORIGIN.fullmatch(self.extension_origin):
            raise ValueError("JOBFILTER_EXTENSION_ORIGIN must be one exact Chrome extension origin")
        if not 1024 <= self.port <= 65535:
            raise ValueError("JOBFILTER_AGENT_PORT must be between 1024 and 65535")
        if not self.agent_model.startswith("alibaba:"):
            raise ValueError("V2 currently supports the Alibaba Model Studio provider")

    @property
    def extension_id(self) -> str:
        return self.extension_origin.removeprefix("chrome-extension://")

    @classmethod
    def from_env(cls) -> "Settings":
        try:
            token = os.environ["JOBFILTER_AGENT_TOKEN"]
            extension_origin = os.environ["JOBFILTER_EXTENSION_ORIGIN"]
        except KeyError as error:
            raise RuntimeError(f"Missing required environment variable: {error.args[0]}") from error
        return cls(
            token=token,
            extension_origin=extension_origin.rstrip("/"),
            port=int(os.environ.get("JOBFILTER_AGENT_PORT", "8765")),
            database_path=Path(
                os.environ.get("JOBFILTER_DATABASE_PATH", "agent-data/jobfilter.sqlite3"),
            ),
            agent_model=os.environ.get("JOBFILTER_AGENT_MODEL", "alibaba:qwen3.7-plus"),
        )
