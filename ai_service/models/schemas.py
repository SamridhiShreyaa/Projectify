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


class ReviewRequest(BaseModel):
    repo_url: str = Field(..., min_length=3, max_length=300, description="GitHub repo URL")


class CategoryScore(BaseModel):
    score: int = Field(..., ge=1, le=10)
    rationale: str


class ReviewOutput(BaseModel):
    repo: str
    mode: str = Field(..., description="'llm' (model-judged) or 'heuristic' (rule-based counting)")
    language: str = Field("", description="Repo's primary language per GitHub metadata")
    detected_stack: str = Field("", description="Stack string detected from languages + tree markers, e.g. 'React + Node.js'")
    scores: dict[str, CategoryScore]


class BriefInput(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    core_features: List[str] = Field(..., min_length=1)
    stretch_goals: List[str] = Field(default_factory=list)
    milestones: List[str] = Field(default_factory=list)
    stack: str = ""


class VerifyRequest(BaseModel):
    repo_url: str = Field(..., min_length=3, max_length=300, description="GitHub repo URL")
    brief: BriefInput


class FeatureVerdict(BaseModel):
    feature: str
    verdict: str = Field(..., description="evident | partial | not_found")
    evidence: str = ""


class MilestoneVerdict(BaseModel):
    milestone: str
    verdict: str = Field(..., description="done | partial | not_started")
    evidence: str = ""


class VerifyOutput(BaseModel):
    repo: str
    mode: str = Field(..., description="'llm' or 'heuristic'")
    language: str = ""
    features: List[FeatureVerdict]
    milestones: List[MilestoneVerdict]
    stack_match: dict
    completion: dict


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
    mermaid_diagram: str = ""

    model_config = ConfigDict(extra="allow")
