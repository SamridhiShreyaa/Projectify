"""
Chain 3 — Expander

Uses LangChain + OpenRouter to expand a validated idea into a full project brief.
Falls back to template mock if OPENROUTER_API_KEY is not set.
"""
import os
import json
import random
from pydantic import BaseModel, Field
from typing import List


# ---------- Output schema ----------
class ExpandedProject(BaseModel):
    title: str
    description: str
    core_features: List[str]
    stretch_goals: List[str]
    scope_notes: str = ""
    milestones: List[str] = Field(description="4 weekly milestones")
    file_structure: str = Field(description="Suggested folder/file structure as plain text")
    learning_outcomes: List[str] = Field(description="4 things the developer will learn")
    resources: List[str] = Field(description="4 specific, relevant learning resources with URLs")


# ---------- Prompt (built lazily) ----------
_EXPAND_PROMPT = None

def _get_prompt():
    global _EXPAND_PROMPT
    if _EXPAND_PROMPT is None:
        from langchain_core.prompts import ChatPromptTemplate
        _EXPAND_PROMPT = ChatPromptTemplate.from_messages([
            ("system", """You are a senior software engineering mentor creating a full project brief.
Respond ONLY with valid JSON — no markdown fences, no explanation.
Schema:
{{
  "title": "string",
  "description": "string",
  "core_features": ["string", ...],
  "stretch_goals": ["string", ...],
  "scope_notes": "string",
  "milestones": ["string", ...],      // exactly 4 weekly milestones
  "file_structure": "string",         // plain text folder tree
  "learning_outcomes": ["string", ...], // exactly 4 items
  "resources": ["string", ...]        // exactly 4 items, format: "Name — https://url"
}}"""),
            ("human", """Expand this project into a full brief:

Title: {title}
Description: {description}
Core features: {features}
Tech stack: {stack}
Scope notes: {scope_notes}

Requirements:
1. Milestones: 4 weekly milestones that build on each other. Each should reference specific features.
2. File structure: A realistic folder/file tree for this specific project and stack. Not generic.
3. Learning outcomes: 4 concrete skills the developer gains from this exact project.
4. Resources: 4 real, specific URLs relevant to this stack and project type.
   Prefer official docs, not tutorials. Format: "Name — https://url"

Make everything specific to this project, not boilerplate.""")
        ])
    return _EXPAND_PROMPT


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
        temperature=0.6,
        max_tokens=1200,
    )


def expand_project(project: dict, stack: str = "") -> dict:
    """Expand project into full brief. Uses LLM if available, falls back to mock."""
    llm = _get_llm()

    if llm:
        try:
            from langchain_core.output_parsers import JsonOutputParser
            parser = JsonOutputParser(pydantic_object=ExpandedProject)
            chain = _get_prompt() | llm | parser
            result = chain.invoke({
                "title": project.get("title", ""),
                "description": project.get("description", ""),
                "features": json.dumps(project.get("core_features", [])),
                "stack": stack,
                "scope_notes": project.get("scope_notes", ""),
            })
            # Carry over any fields the LLM didn't include
            return {**project, **result}
        except Exception as e:
            print(f"[WARN] LLM expansion failed, falling back to mock: {e}")

    return _mock_expand(project, stack)


# ---------- Mock fallback ----------
FILE_STRUCTURES = {
    "React": """project/
├── client/
│   ├── public/index.html
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── context/
│       ├── hooks/
│       ├── api/index.js
│       ├── App.jsx
│       └── main.jsx
├── server/
│   ├── routes/
│   ├── models/
│   ├── middleware/
│   └── index.js
├── .env
└── README.md""",
    "Python": """project/
├── app/
│   ├── main.py
│   ├── models/
│   ├── routes/
│   ├── services/
│   └── utils/
├── tests/
│   ├── test_models.py
│   └── test_routes.py
├── requirements.txt
├── .env
└── README.md""",
    "default": """project/
├── src/
│   ├── components/
│   ├── services/
│   └── utils/
├── tests/
├── .env
├── package.json
└── README.md""",
}

LEARNING_OUTCOMES = [
    "Understanding RESTful API design patterns",
    "Implementing JWT authentication and authorization",
    "Working with NoSQL databases (MongoDB)",
    "Building responsive UIs with modern CSS frameworks",
    "Handling asynchronous operations and state management",
    "Writing clean, maintainable, and testable code",
    "Implementing real-time features with WebSockets",
    "Understanding microservices architecture principles",
    "Deploying applications to cloud platforms",
    "Database schema design and optimization",
]

RESOURCES = [
    "MDN Web Docs — https://developer.mozilla.org",
    "React Documentation — https://react.dev",
    "Node.js Best Practices — https://github.com/goldbergyoni/nodebestpractices",
    "MongoDB University — https://university.mongodb.com",
    "FastAPI Documentation — https://fastapi.tiangolo.com",
    "Tailwind CSS Docs — https://tailwindcss.com/docs",
    "JavaScript.info — https://javascript.info",
    "Python Official Tutorial — https://docs.python.org/3/tutorial",
    "Docker Getting Started — https://docs.docker.com/get-started",
    "JWT.io — https://jwt.io/introduction",
]


def _mock_expand(project: dict, stack: str = "") -> dict:
    stack_lower = stack.lower() if stack else ""
    if any(w in stack_lower for w in ["react", "vue", "next"]):
        file_structure = FILE_STRUCTURES["React"]
    elif any(w in stack_lower for w in ["python", "django", "flask", "fastapi"]):
        file_structure = FILE_STRUCTURES["Python"]
    else:
        file_structure = FILE_STRUCTURES["default"]

    features = project.get("core_features", [])
    milestones = [
        f"Week 1: Project setup, environment configuration, and implement {features[0] if features else 'core architecture'}",
        f"Week 2: Build {features[1] if len(features) > 1 else 'main features'} and {features[2] if len(features) > 2 else 'data layer'}",
        f"Week 3: Implement {features[3] if len(features) > 3 else 'remaining features'} and integrate all components",
        "Week 4: Testing, bug fixes, UI polish, and deployment preparation",
    ]

    return {
        **project,
        "file_structure": file_structure,
        "milestones": milestones,
        "learning_outcomes": random.sample(LEARNING_OUTCOMES, 4),
        "resources": random.sample(RESOURCES, 4),
        "scope_notes": project.get("scope_notes", ""),
    }
