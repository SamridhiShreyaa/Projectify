"""
Chain 2 — Validator

Uses LangChain + OpenRouter to validate and adjust project scope.
Falls back to heuristic mock if OPENROUTER_API_KEY is not set.
"""
import os
import json
from pydantic import BaseModel, Field
from typing import List


# ---------- Output schema ----------
class ValidatedProject(BaseModel):
    title: str
    description: str
    core_features: List[str]
    stretch_goals: List[str]
    scope_notes: str = Field(description="Brief note about any scope adjustments made")


# ---------- Prompt (built lazily) ----------
_VALIDATE_PROMPT = None

def _get_prompt():
    global _VALIDATE_PROMPT
    if _VALIDATE_PROMPT is None:
        from langchain_core.prompts import ChatPromptTemplate
        _VALIDATE_PROMPT = ChatPromptTemplate.from_messages([
            ("system", """You are a senior software engineering mentor reviewing a student's project scope.
Your job is to check if the project is appropriately scoped for the given difficulty and time constraints.
Respond ONLY with valid JSON — no markdown, no explanation.
Schema:
{{
  "title": "string",
  "description": "string",
  "core_features": ["string", ...],
  "stretch_goals": ["string", ...],
  "scope_notes": "string (1 sentence about what was adjusted, or 'Scope looks appropriate.')"
}}"""),
            ("human", """Review this project for a {difficulty} developer with {hours} hours/week:

Project: {title}
Description: {description}
Core features: {features}
Stretch goals: {stretches}

Rules:
- beginner + <5 hrs/week → max 3 core features
- beginner + 5-10 hrs/week → max 4 core features
- intermediate → max 5 core features
- advanced → keep all features
- If features are too advanced for the difficulty level, replace them with simpler equivalents
- Keep the title and description unless they are completely unrealistic
- Move trimmed features to stretch_goals instead of deleting them

Return the adjusted project.""")
        ])
    return _VALIDATE_PROMPT


def _get_llm():
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

    if not api_key:
        return None

    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model="openrouter/free",
        api_key=api_key,
        base_url=base_url,
        temperature=0.3,  # Low temp — this is a validation step, not creative
        max_tokens=600,
    )


def validate_idea(project: dict, difficulty: str, hours: int) -> dict:
    """Validate and adjust project scope. Uses LLM if available, falls back to mock."""
    llm = _get_llm()

    if llm:
        try:
            from langchain_core.output_parsers import JsonOutputParser
            parser = JsonOutputParser(pydantic_object=ValidatedProject)
            chain = _get_prompt() | llm | parser
            result = chain.invoke({
                "difficulty": difficulty,
                "hours": hours,
                "title": project.get("title", ""),
                "description": project.get("description", ""),
                "features": json.dumps(project.get("core_features", [])),
                "stretches": json.dumps(project.get("stretch_goals", [])),
            })
            return result
        except Exception as e:
            print(f"[WARN] LLM validation failed, falling back to mock: {e}")

    return _mock_validate(project, difficulty, hours)


def _mock_validate(project: dict, difficulty: str, hours: int) -> dict:
    """Heuristic fallback — same logic as original."""
    if hours < 5:
        project["core_features"] = project["core_features"][:3]
        project["description"] += " (Scoped down for limited weekly hours.)"
    elif hours < 10:
        project["core_features"] = project["core_features"][:4]

    if difficulty == "beginner":
        project["stretch_goals"].append("Add comprehensive code comments and documentation")
    elif difficulty == "advanced":
        project["stretch_goals"].append("Implement comprehensive test coverage (>80%)")

    project["scope_notes"] = "Scope looks appropriate."
    return project
