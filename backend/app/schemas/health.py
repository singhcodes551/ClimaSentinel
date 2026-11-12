from datetime import datetime
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(..., examples=["healthy"])
    project: str = Field(..., examples=["ClimaSentinel"])
    version: str = Field(..., examples=["0.1.0"])
    timestamp: datetime
    database: str = Field(..., examples=["connected"])
    environment: str = Field(default="development")
