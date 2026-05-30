from pydantic import BaseModel


class GenerateRequest(BaseModel):
    topic: str
    difficulty: str       # "beginner", "intermediate", "advanced"
    stack: str
    hours_per_week: int


class ProjectOutput(BaseModel):
    title: str
    description: str
    core_features: list[str]
    stretch_goals: list[str]
    file_structure: str
    milestones: list[str]
    learning_outcomes: list[str]
    resources: list[str]
