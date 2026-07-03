# Projectify

Projectify is an AI-powered project brief generator that creates structured software project plans based on a topic, difficulty, preferred tech stack, and available weekly hours. It also reviews public GitHub repositories and provides portfolio-oriented feedback.

## Features

- Generate complete project briefs using AI
- Milestones, learning roadmap, and project structure
- Mermaid architecture diagrams
- Downloadable starter code
- GitHub repository reviewer with AI-based scoring
- Retrieval-Augmented Generation (RAG) using ChromaDB
- JWT authentication and project history

## Architecture

```text
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React     │────▶│  Node.js/Express │────▶│  FastAPI        │
│   Frontend  │     │  Backend (API)   │     │  AI Service     │
│   :3000     │     │  :5000           │     │  :8001          │
└─────────────┘     └──────────────────┘     └─────────────────┘
                            │                    │    │      │
                       ┌────▼────┐    ┌──────────▼─┐ ┌▼─────┐ ┌▼──────────┐
                       │ MongoDB │    │ OpenRouter │ │Chroma│ │GitHub API │
                       │         │    │ (LLM API)  │ │(RAG) │ │(reviewer) │
                       └─────────┘    └────────────┘ └──────┘ └───────────┘
```

### AI Workflow

```
Planner → Requirements → Architecture → Generator → Reviewer
```

## Tech Stack

- **Frontend:** React, Vite
- **Backend:** Node.js, Express
- **AI Service:** FastAPI, LangChain, LangGraph
- **Database:** MongoDB
- **Vector Store:** ChromaDB
- **LLM:** OpenRouter
- **DevOps:** Docker, GitHub Actions, Render

## Project Structure

```text
Projectify/
├── client/
├── server/
├── ai_service/
├── .github/workflows/
├── docker-compose.yml
└── render.yaml
```

## Getting Started

```bash
git clone https://github.com/SamridhiShreyaa/Projectify.git
cd Projectify
docker compose up --build
```

Create `.env` files for `server` and `ai_service` using the provided `.env.example` files.

## Testing

```bash
cd ai_service
pytest

cd ../server
npm test
```

## Deployment

Hosted on Render with automatic deployment from the `main` branch.

## License

MIT
