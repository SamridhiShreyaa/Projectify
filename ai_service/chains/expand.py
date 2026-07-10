"""
Chain 3 — Expander

Uses LangChain + OpenRouter to expand a validated idea into a full project brief.
Falls back to template mock if OPENROUTER_API_KEY is not set.
"""
import os
import re
import json
import random
from pydantic import BaseModel, Field
from typing import List


# ---------- Output schema ----------
class SkeletonFile(BaseModel):
    path: str = Field(description="Relative file path, e.g. src/App.jsx")
    content: str = Field(description="Minimal starter content for the file")


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
    skeleton_files: List[SkeletonFile] = Field(
        default_factory=list,
        description="3-6 minimal starter files consistent with the tech stack",
    )
    mermaid_diagram: str = Field(
        default="",
        description="Mermaid graph TD diagram of the proposed architecture",
    )


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
  "resources": ["string", ...],       // exactly 4 items, format: "Name — https://url"
  "skeleton_files": [                 // 3-6 minimal starter files for this stack
    {{"path": "string", "content": "string"}}, ...
  ],
  "mermaid_diagram": "string"         // Mermaid 'graph TD' architecture diagram
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
5. Skeleton files: 3-6 minimal starter files matching the file structure and stack
   (e.g. a basic route file, a component stub, a schema/model file). Keep each
   under ~40 lines — stubs with TODO comments, not full implementations.
6. Mermaid diagram: a 'graph TD' diagram of this project's architecture —
   the main components (UI, API, services, database, external APIs) and the
   arrows between them. Use only plain node labels in square brackets;
   no styling, no subgraphs, no special characters that break Mermaid parsing.

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
        max_tokens=2500,
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
            merged = {**project, **result}
            # JsonOutputParser accepts truncated JSON, so a response cut off at
            # max_tokens can silently drop trailing fields or leave half-built
            # skeleton entries — backfill everything required downstream.
            merged["skeleton_files"] = [
                f for f in merged.get("skeleton_files") or []
                if isinstance(f, dict) and f.get("path") and f.get("content")
            ]
            if not merged["skeleton_files"]:
                merged["skeleton_files"] = _mock_skeleton_files(merged, stack)
            sanitized = _sanitize_mermaid(merged.get("mermaid_diagram", ""))
            merged["mermaid_diagram"] = (
                sanitized if _is_valid_mermaid(sanitized)
                else _mock_mermaid_diagram(merged, stack)
            )
            if not merged.get("milestones"):
                merged["milestones"] = _mock_milestones(merged)
            if not merged.get("file_structure"):
                merged["file_structure"] = FILE_STRUCTURES[_stack_key(stack)]
            if not merged.get("learning_outcomes"):
                merged["learning_outcomes"] = random.sample(LEARNING_OUTCOMES, 4)
            if not merged.get("resources"):
                merged["resources"] = random.sample(RESOURCES, 4)
            return merged
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


SKELETON_FILES = {
    "React": [
        {
            "path": "client/src/App.jsx",
            "content": (
                "import { BrowserRouter, Routes, Route } from 'react-router-dom';\n\n"
                "function App() {\n"
                "    return (\n"
                "        <BrowserRouter>\n"
                "            <Routes>\n"
                "                {/* TODO: add your pages here */}\n"
                "            </Routes>\n"
                "        </BrowserRouter>\n"
                "    );\n"
                "}\n\n"
                "export default App;\n"
            ),
        },
        {
            "path": "client/src/api/index.js",
            "content": (
                "// Central API client — point this at your server\n"
                "const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';\n\n"
                "export async function apiGet(path) {\n"
                "    const res = await fetch(`${BASE_URL}${path}`);\n"
                "    if (!res.ok) throw new Error(`Request failed: ${res.status}`);\n"
                "    return res.json();\n"
                "}\n"
            ),
        },
        {
            "path": "server/index.js",
            "content": (
                "const express = require('express');\n\n"
                "const app = express();\n"
                "app.use(express.json());\n\n"
                "// TODO: mount your routes, e.g. app.use('/api/items', require('./routes/items'));\n\n"
                "app.get('/health', (req, res) => res.json({ status: 'ok' }));\n\n"
                "const PORT = process.env.PORT || 5000;\n"
                "app.listen(PORT, () => console.log(`Server running on ${PORT}`));\n"
            ),
        },
        {
            "path": "server/routes/items.js",
            "content": (
                "const router = require('express').Router();\n\n"
                "// TODO: replace 'items' with your main resource\n"
                "router.get('/', (req, res) => {\n"
                "    res.json([]);\n"
                "});\n\n"
                "router.post('/', (req, res) => {\n"
                "    // TODO: validate and persist req.body\n"
                "    res.status(201).json(req.body);\n"
                "});\n\n"
                "module.exports = router;\n"
            ),
        },
        {
            "path": "server/models/Item.js",
            "content": (
                "// TODO: replace with your real schema (example uses Mongoose)\n"
                "const mongoose = require('mongoose');\n\n"
                "const itemSchema = new mongoose.Schema({\n"
                "    name: { type: String, required: true },\n"
                "    createdAt: { type: Date, default: Date.now },\n"
                "});\n\n"
                "module.exports = mongoose.model('Item', itemSchema);\n"
            ),
        },
    ],
    "Python": [
        {
            "path": "app/main.py",
            "content": (
                "from fastapi import FastAPI\n\n"
                "from app.routes import items\n\n"
                "app = FastAPI(title=\"My Project\")\n"
                "app.include_router(items.router, prefix=\"/items\")\n\n\n"
                "@app.get(\"/health\")\n"
                "def health():\n"
                "    return {\"status\": \"ok\"}\n"
            ),
        },
        {
            "path": "app/routes/items.py",
            "content": (
                "from fastapi import APIRouter\n\n"
                "from app.models.schemas import Item\n\n"
                "router = APIRouter()\n\n\n"
                "@router.get(\"/\")\n"
                "def list_items():\n"
                "    # TODO: fetch from your data layer\n"
                "    return []\n\n\n"
                "@router.post(\"/\")\n"
                "def create_item(item: Item):\n"
                "    # TODO: validate and persist\n"
                "    return item\n"
            ),
        },
        {
            "path": "app/models/schemas.py",
            "content": (
                "from pydantic import BaseModel\n\n\n"
                "class Item(BaseModel):\n"
                "    # TODO: replace with your real fields\n"
                "    name: str\n"
            ),
        },
        {
            "path": "tests/test_routes.py",
            "content": (
                "from fastapi.testclient import TestClient\n\n"
                "from app.main import app\n\n"
                "client = TestClient(app)\n\n\n"
                "def test_health():\n"
                "    res = client.get(\"/health\")\n"
                "    assert res.status_code == 200\n"
            ),
        },
    ],
    "default": [
        {
            "path": "src/index.js",
            "content": (
                "// Entry point\n"
                "// TODO: wire up your application here\n"
                "function main() {\n"
                "    console.log('Hello, project!');\n"
                "}\n\n"
                "main();\n"
            ),
        },
        {
            "path": "src/services/example.js",
            "content": (
                "// TODO: replace with your core service logic\n"
                "export function exampleService() {\n"
                "    return 'not implemented';\n"
                "}\n"
            ),
        },
        {
            "path": "tests/example.test.js",
            "content": (
                "// TODO: replace with real tests for your services\n"
                "test('placeholder', () => {\n"
                "    expect(true).toBe(true);\n"
                "});\n"
            ),
        },
    ],
}


MERMAID_DIAGRAMS = {
    "React": """graph TD
    U[User Browser] --> C[React Client]
    C --> S[Express API Server]
    S --> M[(MongoDB)]
    S --> X[External Services]""",
    "Python": """graph TD
    U[Client] --> A[FastAPI App]
    A --> R[API Routers]
    R --> V[Service Layer]
    V --> D[(Database)]""",
    "default": """graph TD
    U[User] --> F[Frontend]
    F --> B[Backend API]
    B --> D[(Database)]""",
}


# Characters that break Mermaid parsing when they appear unquoted inside a
# node label. When present we wrap the label in double quotes.
_MERMAID_BREAKERS = re.compile(r'[()"@#<>/\\|]')
# Node-shape delimiters. Cylinders/databases ([( )]) are handled before plain
# rectangles ([ ]) so the rectangle pass doesn't swallow their inner parens.
_MERMAID_CYLINDER = re.compile(r'\[\(\s*(.*?)\s*\)\]')
_MERMAID_RECT = re.compile(r'\[(?!\()([^\[\]]*?)\]')
_MERMAID_RHOMBUS = re.compile(r'\{(?!\{)([^{}]*?)\}')


def _clean_mermaid_label(text: str) -> str:
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) >= 2 and text[0] == '"' and text[-1] == '"':
        text = text[1:-1].strip()
    return text.replace('"', "'").replace('\\', ' ')


def _quote_mermaid(open_lit: str, close_lit: str):
    def repl(m: 're.Match') -> str:
        inner = m.group(1)
        clean = _clean_mermaid_label(inner)
        if not clean:
            return f'{open_lit}{close_lit}'
        if _MERMAID_BREAKERS.search(inner):
            return f'{open_lit}"{clean}"{close_lit}'
        return f'{open_lit}{clean}{close_lit}'
    return repl


def _sanitize_mermaid(diagram: str) -> str:
    """Quote node labels that contain characters Mermaid can't parse unquoted.

    LLMs frequently emit labels like ``[User (Browser)]`` or ``[React/Vite]``
    whose parentheses/slashes/quotes break the client-side Mermaid parser
    (showing its "Syntax error" bomb). Wrapping such labels in double quotes
    keeps the diagram renderable while leaving clean diagrams untouched.
    """
    if not isinstance(diagram, str) or not diagram.strip():
        return diagram
    text = diagram.replace('\r\n', '\n')
    text = _MERMAID_CYLINDER.sub(_quote_mermaid('[(', ')]'), text)
    text = _MERMAID_RECT.sub(_quote_mermaid('[', ']'), text)
    text = _MERMAID_RHOMBUS.sub(_quote_mermaid('{', '}'), text)
    return text


def _is_valid_mermaid(diagram: str) -> bool:
    if not isinstance(diagram, str):
        return False
    s = diagram.strip()
    if not s.startswith(("graph", "flowchart")):
        return False
    # Require at least one node/edge line beyond the graph declaration.
    return any(ln.strip() for ln in s.splitlines()[1:])


def _mock_mermaid_diagram(project: dict, stack: str = "") -> str:
    return MERMAID_DIAGRAMS[_stack_key(stack)]


def _stack_key(stack: str) -> str:
    stack_lower = stack.lower() if stack else ""
    if any(w in stack_lower for w in ["react", "vue", "next"]):
        return "React"
    if any(w in stack_lower for w in ["python", "django", "flask", "fastapi"]):
        return "Python"
    return "default"


def _mock_skeleton_files(project: dict, stack: str = "") -> list:
    return [dict(f) for f in SKELETON_FILES[_stack_key(stack)]]


def _mock_milestones(project: dict) -> list:
    features = project.get("core_features", [])
    return [
        f"Week 1: Project setup, environment configuration, and implement {features[0] if features else 'core architecture'}",
        f"Week 2: Build {features[1] if len(features) > 1 else 'main features'} and {features[2] if len(features) > 2 else 'data layer'}",
        f"Week 3: Implement {features[3] if len(features) > 3 else 'remaining features'} and integrate all components",
        "Week 4: Testing, bug fixes, UI polish, and deployment preparation",
    ]


def _mock_expand(project: dict, stack: str = "") -> dict:
    file_structure = FILE_STRUCTURES[_stack_key(stack)]
    milestones = _mock_milestones(project)

    return {
        **project,
        "file_structure": file_structure,
        "milestones": milestones,
        "learning_outcomes": random.sample(LEARNING_OUTCOMES, 4),
        "resources": random.sample(RESOURCES, 4),
        "scope_notes": project.get("scope_notes", ""),
        "skeleton_files": _mock_skeleton_files(project, stack),
        "mermaid_diagram": _mock_mermaid_diagram(project, stack),
    }
