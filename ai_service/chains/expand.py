"""
Chain 3 — Expander (Mock Mode)

In production, this would use LangChain to expand into full project brief.
For development, we generate realistic milestones, file structure, and resources.
"""
import random


FILE_STRUCTURES = {
    "React": """project/
├── client/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── Footer.jsx
│   │   │   └── Dashboard.jsx
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── Login.jsx
│   │   │   └── Profile.jsx
│   │   ├── context/
│   │   │   └── AppContext.jsx
│   │   ├── hooks/
│   │   │   └── useAuth.js
│   │   ├── api/
│   │   │   └── index.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
├── server/
│   ├── routes/
│   ├── models/
│   ├── middleware/
│   └── index.js
├── .env
├── .gitignore
└── README.md""",

    "Python": """project/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py
│   ├── routes/
│   │   ├── __init__.py
│   │   └── api.py
│   ├── services/
│   │   ├── __init__.py
│   │   └── core.py
│   └── utils/
│       └── helpers.py
├── tests/
│   ├── test_models.py
│   └── test_routes.py
├── requirements.txt
├── .env
├── .gitignore
└── README.md""",

    "default": """project/
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── utils/
│   └── index.js
├── tests/
├── config/
├── docs/
├── .env
├── .gitignore
├── package.json
└── README.md"""
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
    "Implementing CI/CD pipelines",
    "Database schema design and optimization",
    "Error handling and logging best practices",
    "Understanding event-driven architecture",
    "Working with Docker and containerization",
    "API versioning and documentation"
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
    "freeCodeCamp — https://www.freecodecamp.org",
    "The Odin Project — https://www.theodinproject.com",
    "Docker Getting Started — https://docs.docker.com/get-started",
    "JWT.io — https://jwt.io/introduction"
]


def expand_project(project: dict, stack: str = "") -> dict:
    """Expand a project idea into a full brief with milestones, structure, and resources."""

    # Determine file structure template
    stack_lower = stack.lower() if stack else ""
    if "react" in stack_lower or "vue" in stack_lower or "next" in stack_lower:
        file_structure = FILE_STRUCTURES["React"]
    elif "python" in stack_lower or "django" in stack_lower or "flask" in stack_lower or "fastapi" in stack_lower:
        file_structure = FILE_STRUCTURES["Python"]
    else:
        file_structure = FILE_STRUCTURES["default"]

    # Generate milestones based on features
    features = project.get("core_features", [])
    milestones = [
        f"Week 1: Project setup, environment configuration, and implement {features[0] if features else 'core architecture'}",
        f"Week 2: Build {features[1] if len(features) > 1 else 'main features'} and {features[2] if len(features) > 2 else 'data layer'}",
        f"Week 3: Implement {features[3] if len(features) > 3 else 'remaining features'} and integrate all components",
        f"Week 4: Testing, bug fixes, UI polish, and deployment preparation"
    ]

    # Select learning outcomes and resources
    outcomes = random.sample(LEARNING_OUTCOMES, min(4, len(LEARNING_OUTCOMES)))
    resources = random.sample(RESOURCES, min(4, len(RESOURCES)))

    return {
        **project,
        "file_structure": file_structure,
        "milestones": milestones,
        "learning_outcomes": outcomes,
        "resources": resources
    }
