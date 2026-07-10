"""
Chain 1 — Idea Generator

Uses LangChain + OpenRouter to generate a project idea from user inputs.
Falls back to mock mode if OPENROUTER_API_KEY is not set.
"""
import os
import random
from pydantic import BaseModel, Field
from typing import List


# ---------- Output schema ----------
class ProjectIdea(BaseModel):
    title: str = Field(description="Short, specific project title")
    description: str = Field(description="2-3 sentence project description")
    core_features: List[str] = Field(description="4-6 core features to implement")
    stretch_goals: List[str] = Field(description="2-3 optional stretch goals")


class ProjectIdeaOption(BaseModel):
    title: str = Field(description="Short, specific project title")
    pitch: str = Field(description="One-sentence hook: why this project is worth building / what you'll learn")
    description: str = Field(description="2-3 sentence project description")
    core_features: List[str] = Field(description="4-6 core features to implement")
    stretch_goals: List[str] = Field(description="2-3 optional stretch goals")


# ---------- Prompt (built lazily) ----------
_IDEA_PROMPT = None

def _get_prompt():
    global _IDEA_PROMPT
    if _IDEA_PROMPT is None:
        from langchain_core.prompts import ChatPromptTemplate
        _IDEA_PROMPT = ChatPromptTemplate.from_messages([
            ("system", """You are a senior software engineering mentor.
Generate a realistic, buildable project idea given the constraints.
Respond ONLY with valid JSON matching this exact schema:
{{
  "title": "string",
  "description": "string (2-3 sentences)",
  "core_features": ["string", ...],  // 4-6 items
  "stretch_goals": ["string", ...]   // 2-3 items
}}
No markdown, no explanation, just JSON."""),
            ("human", """Generate a project idea for:
- Topic: {topic}
- Difficulty: {difficulty}
- Tech stack: {stack}
- Available time: {hours} hours/week

{grounding}

The project must be completable within 4-6 weeks at this pace.
Core features must be achievable at {difficulty} level.
Keep the description practical and specific, not generic.""")
        ])
    return _IDEA_PROMPT


# ---------- Multi-idea prompt (built lazily) ----------
_IDEAS_PROMPT = None

def _get_ideas_prompt():
    global _IDEAS_PROMPT
    if _IDEAS_PROMPT is None:
        from langchain_core.prompts import ChatPromptTemplate
        _IDEAS_PROMPT = ChatPromptTemplate.from_messages([
            ("system", """You are a senior software engineering mentor.
Generate {count} DISTINCT, realistic, buildable project ideas given the constraints.
The ideas must take genuinely different angles on the topic — different core
concepts, use cases, or user audiences — not variations of the same app.
Respond ONLY with valid JSON matching this exact schema:
{{
  "ideas": [
    {{
      "title": "string",
      "pitch": "string (one punchy sentence: why it's worth building / what you'll learn)",
      "description": "string (2-3 sentences)",
      "core_features": ["string", ...],  // 4-6 items
      "stretch_goals": ["string", ...]   // 2-3 items
    }}
    // ... {count} total
  ]
}}
No markdown, no explanation, just JSON."""),
            ("human", """Generate {count} distinct project ideas for:
- Topic: {topic}
- Difficulty: {difficulty}
- Tech stack: {stack}
- Available time: {hours} hours/week

{grounding}

Each project must be completable within 4-6 weeks at this pace and achievable
at {difficulty} level. Make each idea specific and practical, not generic.""")
        ])
    return _IDEAS_PROMPT


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
        temperature=0.8,
        max_tokens=800,
    )


def _ideas_llm():
    """LLM tuned for the multi-idea call — larger token budget for N ideas."""
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model="openrouter/free",
        api_key=api_key,
        base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        temperature=0.9,  # higher temp → more variety across the options
        max_tokens=1800,
    )


def generate_idea(topic: str, difficulty: str, stack: str, hours: int) -> dict:
    """Generate a project idea. Uses LLM if available, falls back to mock."""
    llm = _get_llm()

    if llm:
        try:
            # RAG grounding — best-effort: returns [] if the vector store
            # is empty or unavailable, and generation proceeds ungrounded.
            from retrieval import retrieve_patterns, format_grounding
            grounding = format_grounding(retrieve_patterns(topic, stack, difficulty))

            from langchain_core.output_parsers import JsonOutputParser
            parser = JsonOutputParser(pydantic_object=ProjectIdea)
            chain = _get_prompt() | llm | parser
            result = chain.invoke({
                "topic": topic,
                "difficulty": difficulty,
                "stack": stack,
                "hours": hours,
                "grounding": grounding,
            })
            return result
        except Exception as e:
            print(f"[WARN] LLM call failed, falling back to mock: {e}")

    return _mock_generate_idea(topic, difficulty, stack, hours)


def _first_sentence(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    for sep in (". ", "! ", "? "):
        if sep in text:
            return text.split(sep)[0].strip() + sep.strip()
    return text


def _normalize_idea(raw: dict, difficulty: str) -> dict:
    """Coerce one (possibly partial) LLM idea into a complete option dict."""
    title = str(raw.get("title") or "").strip()
    description = str(raw.get("description") or "").strip()
    features = [str(f).strip() for f in (raw.get("core_features") or []) if str(f).strip()]
    stretches = [str(s).strip() for s in (raw.get("stretch_goals") or []) if str(s).strip()]
    pitch = str(raw.get("pitch") or "").strip() or _first_sentence(description)

    if not features:
        diff_key = difficulty if difficulty in CORE_FEATURES_POOL else "beginner"
        count = {"beginner": 4, "intermediate": 5, "advanced": 6}.get(difficulty, 4)
        features = random.sample(CORE_FEATURES_POOL[diff_key], min(count, len(CORE_FEATURES_POOL[diff_key])))
    if not stretches:
        stretches = random.sample(STRETCH_GOALS, 2)

    return {
        "title": title,
        "pitch": pitch,
        "description": description or pitch,
        "core_features": features,
        "stretch_goals": stretches,
    }


def generate_ideas(topic: str, difficulty: str, stack: str, hours: int, count: int = 3) -> list:
    """Generate several DISTINCT project ideas to choose from.

    One LLM call produces N lightweight ideas (no expansion). Falls back to
    distinct mock templates when no API key is set or the call fails.
    """
    llm = _ideas_llm()

    if llm:
        try:
            from retrieval import retrieve_patterns, format_grounding
            grounding = format_grounding(retrieve_patterns(topic, stack, difficulty))

            from langchain_core.output_parsers import JsonOutputParser
            parser = JsonOutputParser()
            chain = _get_ideas_prompt() | llm | parser
            result = chain.invoke({
                "topic": topic,
                "difficulty": difficulty,
                "stack": stack,
                "hours": hours,
                "count": count,
                "grounding": grounding,
            })
            # Tolerate either {"ideas": [...]} or a bare list.
            raw_ideas = result.get("ideas") if isinstance(result, dict) else result
            if isinstance(raw_ideas, dict):
                raw_ideas = [raw_ideas]
            cleaned = [
                _normalize_idea(i, difficulty)
                for i in (raw_ideas or [])
                if isinstance(i, dict) and str(i.get("title") or "").strip()
            ]
            # Drop duplicate titles the model may have repeated.
            seen, unique = set(), []
            for idea in cleaned:
                key = idea["title"].lower()
                if key not in seen:
                    seen.add(key)
                    unique.append(idea)
            if len(unique) >= 2:
                return unique[:count]
        except Exception as e:
            print(f"[WARN] LLM ideas call failed, falling back to mock: {e}")

    return _mock_generate_ideas(topic, difficulty, stack, hours, count)


# ---------- Mock fallback (unchanged from original) ----------
MOCK_TEMPLATES = {
    "web": {
        "titles": [
            "Real-Time Collaborative Whiteboard",
            "AI-Powered Recipe Recommendation Engine",
            "Social Media Analytics Dashboard",
            "Interactive Code Playground",
            "Peer-to-Peer File Sharing Platform",
        ],
        "descriptions": [
            "Build a real-time collaborative whiteboard where multiple users can draw, add sticky notes, and brainstorm together. Features WebSocket-powered live sync and an intuitive canvas interface.",
            "Create an intelligent recipe recommendation engine that learns from user preferences, dietary restrictions, and available ingredients to suggest personalized meal plans.",
            "Design a comprehensive analytics dashboard that aggregates social media metrics across platforms, providing actionable insights through interactive charts and automated reports.",
            "Develop an interactive online code playground supporting multiple languages, with real-time output preview, code sharing, and collaborative editing capabilities.",
            "Build a decentralized file sharing platform using WebRTC for peer-to-peer connections, featuring end-to-end encryption and no central server dependency.",
        ],
    },
    "mobile": {
        "titles": [
            "Habit Tracking App with Streaks",
            "Augmented Reality Navigation Guide",
            "Personal Finance Tracker",
            "Workout Companion with AI Coach",
            "Language Learning Flashcard App",
        ],
        "descriptions": [
            "Create a beautifully designed habit tracking app that gamifies daily routines with streaks, achievements, and insightful progress analytics.",
            "Build an AR-powered navigation app that overlays directions and points of interest onto the camera view for an immersive exploration experience.",
            "Design a comprehensive personal finance tracker with budget categories, spending analytics, bill reminders, and savings goal visualization.",
            "Develop a workout companion app with an AI coach that creates personalized exercise plans, tracks progress, and adjusts difficulty dynamically.",
            "Create a spaced-repetition flashcard app for language learning with pronunciation guides, progress tracking, and adaptive difficulty.",
        ],
    },
    "data": {
        "titles": [
            "Stock Market Sentiment Analyzer",
            "Automated Data Pipeline Dashboard",
            "Customer Churn Prediction System",
            "Real-Time IoT Data Visualizer",
            "News Aggregator with NLP Classification",
        ],
        "descriptions": [
            "Build a sentiment analysis system that scrapes financial news and social media to gauge market sentiment, presenting findings through interactive visualizations.",
            "Create an automated ETL pipeline dashboard that monitors data flows, detects anomalies, and provides real-time health metrics for data infrastructure.",
            "Develop a machine learning system that predicts customer churn using historical data, providing actionable retention strategies and risk scores.",
            "Design a real-time IoT data visualization platform that ingests sensor data, displays live metrics, and triggers alerts based on configurable thresholds.",
            "Build a news aggregator that uses NLP to classify articles by topic, sentiment, and credibility, providing a personalized news feed.",
        ],
    },
    "default": {
        "titles": [
            "Multi-Tenant Task Management Platform",
            "Event-Driven Microservices Marketplace",
            "Real-Time Chat Application",
            "Content Management System with RBAC",
            "API Gateway with Rate Limiting",
        ],
        "descriptions": [
            "Build a multi-tenant task management platform with workspaces, kanban boards, real-time updates, and team collaboration features.",
            "Create an event-driven microservices marketplace where vendors can list products, manage inventory, and process orders asynchronously.",
            "Develop a full-featured real-time chat application with channels, direct messages, file sharing, and message search functionality.",
            "Design a headless CMS with role-based access control, content versioning, and a RESTful API for frontend consumption.",
            "Build an API gateway service with rate limiting, authentication, request logging, and load balancing capabilities.",
        ],
    },
}

CORE_FEATURES_POOL = {
    "beginner": [
        "User authentication (signup/login)",
        "CRUD operations for main resources",
        "Responsive UI with mobile support",
        "Basic search and filtering",
        "Form validation and error handling",
        "Data persistence with database",
        "Clean navigation and routing",
    ],
    "intermediate": [
        "JWT-based authentication with refresh tokens",
        "Real-time updates via WebSockets",
        "File upload and media handling",
        "Advanced search with pagination",
        "Role-based access control",
        "API rate limiting and caching",
        "Comprehensive error handling and logging",
        "Unit and integration tests",
    ],
    "advanced": [
        "Microservices architecture with service discovery",
        "Event-driven communication (message queues)",
        "CI/CD pipeline with automated testing",
        "Containerization with Docker and orchestration",
        "Performance monitoring and alerting",
        "GraphQL API with subscriptions",
        "Distributed caching with Redis",
        "Load balancing and horizontal scaling",
    ],
}

STRETCH_GOALS = [
    "Add OAuth2 social login (Google, GitHub)",
    "Implement dark mode with theme persistence",
    "Add export functionality (PDF, CSV)",
    "Build a CLI companion tool",
    "Add email notifications",
    "Implement webhooks for integrations",
    "Add analytics and usage tracking",
    "Build an admin dashboard",
]


def _mock_generate_idea(topic: str, difficulty: str, stack: str, hours: int) -> dict:
    topic_lower = topic.lower()
    if any(w in topic_lower for w in ["web", "frontend", "react", "vue", "angular", "html", "css"]):
        category = "web"
    elif any(w in topic_lower for w in ["mobile", "app", "ios", "android", "flutter", "react native"]):
        category = "mobile"
    elif any(w in topic_lower for w in ["data", "ml", "ai", "machine learning", "analytics", "python"]):
        category = "data"
    else:
        category = "default"

    templates = MOCK_TEMPLATES[category]
    idx = random.randint(0, len(templates["titles"]) - 1)

    feature_count = {"beginner": 4, "intermediate": 5, "advanced": 6}.get(difficulty, 4)
    diff_key = difficulty if difficulty in CORE_FEATURES_POOL else "beginner"
    features = random.sample(
        CORE_FEATURES_POOL[diff_key],
        min(feature_count, len(CORE_FEATURES_POOL[diff_key]))
    )
    stretches = random.sample(STRETCH_GOALS, 2)

    return {
        "title": templates["titles"][idx],
        "description": templates["descriptions"][idx],
        "core_features": features,
        "stretch_goals": stretches,
    }


def _mock_generate_ideas(topic: str, difficulty: str, stack: str, hours: int, count: int = 3) -> list:
    """Return `count` DISTINCT mock ideas by sampling different templates."""
    topic_lower = topic.lower()
    if any(w in topic_lower for w in ["web", "frontend", "react", "vue", "angular", "html", "css"]):
        category = "web"
    elif any(w in topic_lower for w in ["mobile", "app", "ios", "android", "flutter", "react native"]):
        category = "mobile"
    elif any(w in topic_lower for w in ["data", "ml", "ai", "machine learning", "analytics", "python"]):
        category = "data"
    else:
        category = "default"

    templates = MOCK_TEMPLATES[category]
    n = min(count, len(templates["titles"]))
    idxs = random.sample(range(len(templates["titles"])), n)

    feature_count = {"beginner": 4, "intermediate": 5, "advanced": 6}.get(difficulty, 4)
    diff_key = difficulty if difficulty in CORE_FEATURES_POOL else "beginner"

    ideas = []
    for idx in idxs:
        features = random.sample(
            CORE_FEATURES_POOL[diff_key],
            min(feature_count, len(CORE_FEATURES_POOL[diff_key]))
        )
        description = templates["descriptions"][idx]
        ideas.append({
            "title": templates["titles"][idx],
            "pitch": _first_sentence(description),
            "description": description,
            "core_features": features,
            "stretch_goals": random.sample(STRETCH_GOALS, 2),
        })
    return ideas
