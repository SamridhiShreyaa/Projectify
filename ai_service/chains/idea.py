"""
Chain 1 — Idea Generator (Mock Mode)

In production, this would use LangChain + OpenAI to generate project ideas.
For development, we return realistic mock data based on the input parameters.
"""
import json
import random


# Mock project templates by topic category
MOCK_TEMPLATES = {
    "web": {
        "titles": [
            "Real-Time Collaborative Whiteboard",
            "AI-Powered Recipe Recommendation Engine",
            "Social Media Analytics Dashboard",
            "Interactive Code Playground",
            "Peer-to-Peer File Sharing Platform"
        ],
        "descriptions": [
            "Build a real-time collaborative whiteboard where multiple users can draw, add sticky notes, and brainstorm together. Features WebSocket-powered live sync and an intuitive canvas interface.",
            "Create an intelligent recipe recommendation engine that learns from user preferences, dietary restrictions, and available ingredients to suggest personalized meal plans.",
            "Design a comprehensive analytics dashboard that aggregates social media metrics across platforms, providing actionable insights through interactive charts and automated reports.",
            "Develop an interactive online code playground supporting multiple languages, with real-time output preview, code sharing, and collaborative editing capabilities.",
            "Build a decentralized file sharing platform using WebRTC for peer-to-peer connections, featuring end-to-end encryption and no central server dependency."
        ]
    },
    "mobile": {
        "titles": [
            "Habit Tracking App with Streaks",
            "Augmented Reality Navigation Guide",
            "Personal Finance Tracker",
            "Workout Companion with AI Coach",
            "Language Learning Flashcard App"
        ],
        "descriptions": [
            "Create a beautifully designed habit tracking app that gamifies daily routines with streaks, achievements, and insightful progress analytics.",
            "Build an AR-powered navigation app that overlays directions and points of interest onto the camera view for an immersive exploration experience.",
            "Design a comprehensive personal finance tracker with budget categories, spending analytics, bill reminders, and savings goal visualization.",
            "Develop a workout companion app with an AI coach that creates personalized exercise plans, tracks progress, and adjusts difficulty dynamically.",
            "Create a spaced-repetition flashcard app for language learning with pronunciation guides, progress tracking, and adaptive difficulty."
        ]
    },
    "data": {
        "titles": [
            "Stock Market Sentiment Analyzer",
            "Automated Data Pipeline Dashboard",
            "Customer Churn Prediction System",
            "Real-Time IoT Data Visualizer",
            "News Aggregator with NLP Classification"
        ],
        "descriptions": [
            "Build a sentiment analysis system that scrapes financial news and social media to gauge market sentiment, presenting findings through interactive visualizations.",
            "Create an automated ETL pipeline dashboard that monitors data flows, detects anomalies, and provides real-time health metrics for data infrastructure.",
            "Develop a machine learning system that predicts customer churn using historical data, providing actionable retention strategies and risk scores.",
            "Design a real-time IoT data visualization platform that ingests sensor data, displays live metrics, and triggers alerts based on configurable thresholds.",
            "Build a news aggregator that uses NLP to classify articles by topic, sentiment, and credibility, providing a personalized news feed."
        ]
    },
    "default": {
        "titles": [
            "Multi-Tenant Task Management Platform",
            "Event-Driven Microservices Marketplace",
            "Real-Time Chat Application",
            "Content Management System with RBAC",
            "API Gateway with Rate Limiting"
        ],
        "descriptions": [
            "Build a multi-tenant task management platform with workspaces, kanban boards, real-time updates, and team collaboration features.",
            "Create an event-driven microservices marketplace where vendors can list products, manage inventory, and process orders asynchronously.",
            "Develop a full-featured real-time chat application with channels, direct messages, file sharing, and message search functionality.",
            "Design a headless CMS with role-based access control, content versioning, and a RESTful API for frontend consumption.",
            "Build an API gateway service with rate limiting, authentication, request logging, and load balancing capabilities."
        ]
    }
}

CORE_FEATURES_POOL = {
    "beginner": [
        "User authentication (signup/login)",
        "CRUD operations for main resources",
        "Responsive UI with mobile support",
        "Basic search and filtering",
        "Form validation and error handling",
        "Data persistence with database",
        "Clean navigation and routing"
    ],
    "intermediate": [
        "JWT-based authentication with refresh tokens",
        "Real-time updates via WebSockets",
        "File upload and media handling",
        "Advanced search with pagination",
        "Role-based access control",
        "API rate limiting and caching",
        "Comprehensive error handling and logging",
        "Unit and integration tests"
    ],
    "advanced": [
        "Microservices architecture with service discovery",
        "Event-driven communication (message queues)",
        "CI/CD pipeline with automated testing",
        "Containerization with Docker and orchestration",
        "Performance monitoring and alerting",
        "GraphQL API with subscriptions",
        "Distributed caching with Redis",
        "Load balancing and horizontal scaling"
    ]
}

STRETCH_GOALS = [
    "Add OAuth2 social login (Google, GitHub)",
    "Implement dark mode with theme persistence",
    "Add export functionality (PDF, CSV)",
    "Build a CLI companion tool",
    "Add email notifications",
    "Implement webhooks for integrations",
    "Add analytics and usage tracking",
    "Build an admin dashboard"
]


def generate_idea(topic: str, difficulty: str, stack: str, hours: int) -> dict:
    """Generate a mock project idea based on input parameters."""

    # Determine category
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

    # Adjust feature count by difficulty
    feature_count = {"beginner": 4, "intermediate": 5, "advanced": 6}.get(difficulty, 4)
    diff_key = difficulty if difficulty in CORE_FEATURES_POOL else "beginner"
    features = random.sample(CORE_FEATURES_POOL[diff_key], min(feature_count, len(CORE_FEATURES_POOL[diff_key])))
    stretches = random.sample(STRETCH_GOALS, 2)

    return {
        "title": templates["titles"][idx],
        "description": templates["descriptions"][idx],
        "core_features": features,
        "stretch_goals": stretches
    }
