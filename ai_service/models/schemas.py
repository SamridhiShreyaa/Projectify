"""
Pydantic schemas for request/response validation.
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import List, Optional


class GenerateRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=200, description="Project topic or domain")
    difficulty: str = Field(..., description="beginner | intermediate | advanced")
    stack: str = Field(..., min_length=2, max_length=200, description="Tech stack")
    hours_per_week: int = Field(..., ge=1, le=80, description="Available hours per week")

    @field_validator("difficulty")
    @classmethod
    def difficulty_must_be_valid(cls, v: str) -> str:
        valid = {"beginner", "intermediate", "advanced"}
        if v not in valid:
            raise ValueError(f"difficulty must be one of: {', '.join(valid)}")
        return v

    @field_validator("topic", "stack")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip()


class SkeletonFile(BaseModel):
    path: str = Field(..., description="Relative file path, e.g. src/App.jsx")
    content: str = Field(..., description="Minimal starter content for the file")


class ProjectOutput(BaseModel):
    title: str
    description: str
    core_features: List[str]
    stretch_goals: List[str]
    scope_notes: Optional[str] = ""
    milestones: List[str]
    file_structure: str
    learning_outcomes: List[str]
    resources: List[str]
    skeleton_files: List[SkeletonFile] = Field(default_factory=list)

    model_config = ConfigDict(extra="allow")
