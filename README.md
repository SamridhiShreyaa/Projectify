# Projectify

An AI-powered project brief generator for developers. Give it a topic, difficulty level, tech stack, and your available hours per week — it returns a complete project brief with features, milestones, file structure, an architecture diagram, downloadable starter code, learning outcomes, and resources. It can also review any public GitHub repo and score it as a portfolio piece.

---

## Features

- AI-generated project briefs — title, description, core features, stretch goals, milestones, file structure, learning outcomes, resources
- Downloadable starter code skeletons for each brief
- Mermaid architecture diagram rendered inline for each brief
- GitHub repo reviewer — scores architecture clarity, test coverage signal, documentation quality, and hiring signal (1–10)
- LangGraph-orchestrated generation pipeline (planner → requirements → architecture → generator → reviewer)
- RAG grounding — idea generation retrieves similar patterns from a curated corpus in ChromaDB
- Mock fallback — works without an API key for local development and CI
- JWT authentication, rate limiting, input validation, and CORS/Helmet security headers

---

## Demo

**Live:** [projectify-client.onrender.com](https://projectify-client.onrender.com)

> Render free tier services spin down after inactivity — first request may take 30–60 seconds.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Mermaid, JSZip |
| Backend | Node.js, Express, JWT auth, Helmet |
| AI Service | Python, FastAPI, LangChain, LangGraph |
| Vector Store | ChromaDB (RAG grounding corpus) |
| Database | MongoDB |
| LLM Provider | OpenRouter (`openrouter/free` auto-router) |
| Containerization | Docker, Docker Compose |
| CI/CD | GitHub Actions |
| Deployment | Render |

---

## Architecture (optional)

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React     │────▶│  Node.js/Express │────▶│  FastAPI        │
│   Frontend  │     │  Backend (API)   │     │  AI Service     │
└─────────────┘     └──────────────────┘     └─────────────────┘
                            │                    │    │      │
                       ┌────▼────┐    ┌──────────▼─┐ ┌▼─────┐ ┌▼──────────┐
                       │ MongoDB │    │ OpenRouter │ │Chroma│ │GitHub API │
                       │         │    │ (LLM API)  │ │(RAG) │ │(reviewer) │
                       └─────────┘    └────────────┘ └──────┘ └───────────┘
```

The AI service runs an explicit LangGraph state graph (`planner → requirements → architecture → generator → reviewer`); each chain calls `openrouter/free` and falls back to mock mode without an API key.

---

## Project Structure

```
Projectify/
├── ai_service/            # FastAPI AI service
│   ├── chains/             # idea, validate, expand, review chains
│   ├── data/                # RAG seed corpus
│   ├── models/              # Pydantic schemas
│   ├── tests/
│   ├── graph.py             # LangGraph pipeline
│   ├── retrieval.py         # Chroma retrieval
│   └── main.py               # FastAPI app
├── server/                # Node.js Express backend
│   ├── routes/               # auth, generate, review, projects
│   ├── models/                # User, Project, Review
│   ├── middleware/             # JWT auth
│   └── index.js
├── client/                # React frontend
│   ├── src/pages/
│   └── src/components/
├── .github/workflows/     # CI/CD pipeline
├── docker-compose.yml
└── render.yaml             # Render deployment config
```

---

## Installation

**Prerequisites:** Node.js 20+, Python 3.11+, Docker (optional), MongoDB (or use Docker), an [OpenRouter](https://openrouter.ai) API key (optional — free tier works).

```bash
git clone https://github.com/SamridhiShreyaa/Projectify.git
cd Projectify
```

**Run with Docker Compose:**
```bash
docker compose up --build
```

**Or run each service individually:**
```bash
# AI Service
cd ai_service && pip install -r requirements.txt
uvicorn main:app --port 8001 --reload

# Server
cd server && npm install
npm run dev

# Client
cd client && npm install
npm run dev
```

---

## Usage

1. Sign up / log in from the client.
2. On the Home page, enter a topic, difficulty, tech stack, and hours per week, then generate a brief.
3. View the brief's milestones, file structure, and architecture diagram, and download the starter code as a zip.
4. Paste a public GitHub repo URL into the Review page to get portfolio-readiness scores.

Or call the API directly:
```bash
curl -X POST http://localhost:8001/generate \
  -H "Content-Type: application/json" \
  -d '{"topic":"habit tracker","difficulty":"beginner","stack":"React, Node.js","hours_per_week":6}'
```

---

## API Endpoints (if applicable)

### AI Service (port 8001)
| Method | Route | Description |
|---|---|---|
| POST | `/generate` | Generate a project brief |
| POST | `/review-repo` | Score a public GitHub repo |
| GET | `/health` | Health check |

### Backend Server (port 5000) — all except auth/health require `Authorization: Bearer <token>`
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/generate` | Generate and save a project brief |
| POST | `/api/review` | Review a GitHub repo, save the result |
| GET | `/api/review` | Get the user's past repo reviews |
| GET | `/api/projects` | Get all projects for logged-in user |
| DELETE | `/api/projects/:id` | Delete a project |
| GET | `/api/health` | Health check with DB status |

---

## Environment Variables

| Variable | Service | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | ai_service | OpenRouter API key for LLM calls |
| `OPENROUTER_BASE_URL` | ai_service | OpenRouter base URL |
| `ALLOWED_ORIGINS` | ai_service, server | Comma-separated allowed CORS origins |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | ai_service | Rate limit config (default: 5 per 60s) |
| `CHROMA_DIR` | ai_service | Chroma persistence dir |
| `PORT` | server | Server port (default: 5000) |
| `MONGO_URI` | server | MongoDB connection string |
| `JWT_SECRET` | server | Secret for signing JWTs |
| `AI_SERVICE_URL` | server | URL of the AI service |
| `VITE_API_URL` | client | Server origin, baked in at build time |

---

## License

This project is licensed under the [MIT License](LICENSE).

## Author

[SamridhiShreyaa](https://github.com/SamridhiShreyaa)
