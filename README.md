# Projectify

An AI-powered project brief generator for developers. Give it a topic, difficulty level, tech stack, and your available hours per week — it returns a complete project brief with features, milestones, file structure, an architecture diagram, downloadable starter code, learning outcomes, and resources. It can also review any public GitHub repo and score it as a portfolio piece.

Built as a microservices architecture with a LangGraph-orchestrated LLM pipeline: idea generation → scope validation → full brief expansion, grounded by retrieval over a curated corpus of real project patterns.

**Live:** [projectify-ai.onrender.com](https://projectify-ai.onrender.com/health)

---

## Architecture

```
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

**LangGraph pipeline inside the AI service** (`graph.py`) — an explicit state graph with five named nodes:

```
planner → requirements → architecture → generator → reviewer
```

- **planner** (Chain 1, `chains/idea.py`) — generates the raw project idea, grounded by top-k retrieval over the Chroma seed corpus
- **requirements** (Chain 2, `chains/validate.py`) — validates and adjusts scope to difficulty and available hours
- **architecture** — normalizes the inputs the expansion step depends on
- **generator** (Chain 3, `chains/expand.py`) — expands into the full brief: milestones, file structure, starter code skeletons, Mermaid architecture diagram
- **reviewer** — final completeness check on the brief

Each chain calls `openrouter/free` (OpenRouter's free-model auto-router). Everything falls back to mock mode if no API key is set — useful for local development without burning credits.

A separate chain (`chains/review.py`) powers the GitHub repo reviewer: it fetches a repo's file tree and README via the GitHub REST API (cached, rate-limit-aware) and scores it on architecture clarity, test coverage signal, documentation quality, and hiring signal.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Mermaid (diagram rendering), JSZip (starter-file downloads) |
| Backend | Node.js, Express, JWT auth, Helmet |
| AI Service | Python, FastAPI, LangChain, LangGraph |
| Vector Store | ChromaDB (RAG grounding corpus) |
| Database | MongoDB |
| LLM Provider | OpenRouter (`openrouter/free` auto-router) |
| Containerization | Docker, Docker Compose |
| CI/CD | GitHub Actions |
| Deployment | Render |

---

## Features

- **AI-generated project briefs** — title, description, core features, stretch goals, milestones, file structure, learning outcomes, resources
- **Starter code skeletons** — each brief includes minimal, stack-appropriate starter files (`skeleton_files`), downloadable as a zip from the results page
- **Architecture diagrams** — every brief ships a Mermaid `graph TD` diagram of the proposed architecture, rendered inline
- **GitHub repo reviewer** — paste any public repo URL and get 1–10 scores with rationales for architecture clarity, test coverage signal, documentation quality, and overall hiring signal
- **LangGraph orchestration** — the generation pipeline is an explicit five-node state graph (planner → requirements → architecture → generator → reviewer)
- **RAG grounding** — idea generation retrieves similar patterns from a curated 38-entry corpus in ChromaDB and injects them as prompt context
- **Mock fallback** — works fully without an API key (and without a populated vector store) for local development and CI
- **Rate limiting** — 5 requests per minute per IP (AI service) and per user (Node server)
- **Input validation** — Pydantic on the Python side, custom validation on the Node side
- **JWT authentication** — signup, login, token-based access on all protected routes
- **Security headers & CORS allowlists** — Helmet on Express; both services restrict origins via `ALLOWED_ORIGINS`
- **Project persistence** — save, view, and delete generated projects and repo reviews per user

---

## Project Structure

```
Projectify/
├── ai_service/                 # FastAPI AI service
│   ├── chains/
│   │   ├── idea.py             # Chain 1: generates raw project idea (RAG-grounded)
│   │   ├── validate.py         # Chain 2: validates and adjusts scope
│   │   ├── expand.py           # Chain 3: full brief + skeletons + Mermaid diagram
│   │   └── review.py           # Chain 4: GitHub repo reviewer
│   ├── data/
│   │   └── project_patterns.json  # 38-entry RAG seed corpus
│   ├── scripts/
│   │   └── ingest.py           # One-off: embed seed corpus into Chroma
│   ├── models/
│   │   └── schemas.py          # Pydantic request/response schemas
│   ├── tests/
│   │   ├── conftest.py
│   │   └── test_ai_service.py  # 83 tests
│   ├── graph.py                # LangGraph pipeline (5 named nodes)
│   ├── retrieval.py            # Chroma retrieval + deterministic embeddings
│   ├── main.py                 # FastAPI app, rate limiting, validation
│   ├── requirements.txt
│   └── Dockerfile
├── server/                     # Node.js Express backend
│   ├── routes/
│   │   ├── auth.js             # Signup, login
│   │   ├── generate.js         # Calls AI service, saves to DB
│   │   ├── review.js           # Proxies repo reviews, saves per user
│   │   └── projects.js         # CRUD for saved projects
│   ├── models/
│   │   ├── User.js
│   │   ├── Project.js
│   │   └── Review.js
│   ├── middleware/
│   │   └── auth.js             # JWT verification
│   ├── tests/
│   │   └── server.test.js      # 54 tests
│   ├── index.js                # Express app, Helmet, CORS allowlist
│   ├── jest.config.json
│   └── Dockerfile
├── client/                     # React frontend
│   ├── src/pages/              # Home, Result, Saved, ReviewRepo, auth pages
│   ├── src/components/         # MermaidDiagram, Milestone, Navbar, ...
│   └── Dockerfile
├── .github/
│   └── workflows/
│       └── ci.yml              # CI/CD pipeline
├── LICENSE                     # MIT
├── docker-compose.yml
└── render.yaml                 # Render deployment config
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker and Docker Compose
- MongoDB (or use Docker)
- OpenRouter API key (free tier works — get one at [openrouter.ai](https://openrouter.ai))

### Local Setup

**1. Clone the repo**
```bash
git clone https://github.com/SamridhiShreyaa/Projectify.git
cd Projectify
```

**2. Set up environment variables**

`ai_service/.env`:
```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
ALLOWED_ORIGINS=http://localhost:3000
```

`server/.env`:
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/projectify
JWT_SECRET=your-secret-key
AI_SERVICE_URL=http://localhost:8001
```

**3. Run with Docker Compose**
```bash
docker compose up --build
```

Or run services individually:

```bash
# AI Service
cd ai_service
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload

# Server
cd server
npm install
npm run dev

# Client
cd client
npm install
npm run dev
```

**4. Verify everything is running**
```bash
curl http://localhost:8001/health
# {"status":"ok","mode":"llm","rate_limit":"5 requests per 60s"}
```

If `mode` is `mock`, your `OPENROUTER_API_KEY` isn't being picked up. If no key is set intentionally, mock mode returns realistic pre-built responses — fine for development.

---

## API Reference

### AI Service (port 8001)

#### `POST /generate`
Generate a project brief.

**Request:**
```json
{
  "topic": "web development",
  "difficulty": "intermediate",
  "stack": "React, Node.js, MongoDB",
  "hours_per_week": 10
}
```

**Constraints:**
- `topic`: 3–200 characters
- `difficulty`: `beginner` | `intermediate` | `advanced`
- `stack`: 2–200 characters
- `hours_per_week`: 1–80

**Response:**
```json
{
  "title": "Real-Time Collaborative Whiteboard",
  "description": "...",
  "core_features": ["...", "..."],
  "stretch_goals": ["...", "..."],
  "milestones": ["Week 1: ...", "Week 2: ...", "Week 3: ...", "Week 4: ..."],
  "file_structure": "project/\n├── src/\n...",
  "learning_outcomes": ["...", "..."],
  "resources": ["MDN Web Docs — https://developer.mozilla.org", "..."],
  "scope_notes": "Scope looks appropriate.",
  "skeleton_files": [{"path": "src/App.jsx", "content": "..."}],
  "mermaid_diagram": "graph TD\n    U[User Browser] --> C[React Client]\n    ..."
}
```

**Rate limit:** 5 requests per 60 seconds per IP.

#### `POST /review-repo`
Score a public GitHub repository as a portfolio piece.

**Request:**
```json
{"repo_url": "https://github.com/owner/repo"}
```

**Response:**
```json
{
  "repo": "owner/repo",
  "scores": {
    "architecture_clarity": {"score": 7, "rationale": "..."},
    "test_coverage_signal": {"score": 6, "rationale": "..."},
    "documentation_quality": {"score": 8, "rationale": "..."},
    "hiring_signal": {"score": 7, "rationale": "..."}
  }
}
```

**Errors:** `422` invalid URL · `404` repo missing or private · `503` GitHub API rate limit reached (unauthenticated GitHub calls are cached for 10 minutes to stay under the 60 req/hour limit).

#### `GET /health`
```json
{"status": "ok", "mode": "llm", "rate_limit": "5 requests per 60s"}
```

### Backend Server (port 5000)

All `/api/generate`, `/api/projects`, and `/api/review` routes require `Authorization: Bearer <token>`.

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

## Running Tests

**Python (83 tests):**
```bash
cd ai_service
pytest tests/ -v
```

**Node.js (54 tests):**
```bash
cd server
npm test
```

Tests run in full mock/in-memory mode — no API keys, real database, or network needed (GitHub responses are mocked; retrieval tests use a temporary Chroma store).

**What's tested:**
- Health endpoint and mode reporting
- `/generate` happy path — response shape, all difficulty levels, skeleton files, Mermaid diagram syntax
- LangGraph pipeline — node execution order, end-to-end mock mode
- RAG retrieval — ingest + retrieve for a known topic, empty-store fallback
- `/review-repo` — URL parsing, mocked GitHub happy path, response caching, 404/422/503 handling
- Input validation — 11 invalid payload cases
- Rate limiting — window enforcement and reset, per-endpoint
- Auth — signup, login, JWT structure, password hashing
- CORS allowlist and Helmet security headers
- AI service error handling — 503, 504, 429 mapping
- Project & review persistence — user isolation, sort order, ownership checks
- Chain unit tests — idea generation, scope validation, expansion logic

---

## CI/CD Pipeline

Every push and pull request runs:

```
┌─────────────────────┐  ┌─────────────────────┐
│  Test AI Service    │  │  Test Server        │
│  pytest + ruff lint │  │  jest               │
└──────────┬──────────┘  └──────────┬──────────┘
           └─────────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │  Docker Build Check │
              │  compose build +    │
              │  containers start   │
              └──────────┬──────────┘
                         │ (main branch only)
                         ▼
              ┌─────────────────────┐
              │ Post-Deploy Smoke   │
              │ Test /health on     │
              │ live Render URLs    │
              └─────────────────────┘
```

Branch protection on `main` requires all three CI jobs to pass before merging.

---

## Deployment

Deployed on Render via `render.yaml`. Both services auto-deploy on push to `main`.

- AI Service: [projectify-ai.onrender.com](https://projectify-ai.onrender.com/health)
- Backend: projectify-api.onrender.com

> **Note:** Render free tier services spin down after inactivity. First request after a period of inactivity may take 30–60 seconds.

---

## Environment Variables Reference

| Variable | Service | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | ai_service | OpenRouter API key for LLM calls |
| `OPENROUTER_BASE_URL` | ai_service | OpenRouter base URL |
| `ALLOWED_ORIGINS` | ai_service | Comma-separated allowed CORS origins |
| `RATE_LIMIT_MAX` | ai_service | Max requests per window (default: 5) |
| `RATE_LIMIT_WINDOW` | ai_service | Window in seconds (default: 60) |
| `CHROMA_DIR` | ai_service | Chroma persistence dir (default: `ai_service/.chroma`) |
| `PORT` | server | Server port (default: 5000) |
| `MONGO_URI` | server | MongoDB connection string |
| `JWT_SECRET` | server | Secret for signing JWTs |
| `AI_SERVICE_URL` | server | URL of the AI service |
| `ALLOWED_ORIGINS` | server | Comma-separated allowed CORS origins (default: `http://localhost:3000`) |

To populate the RAG corpus locally (optional — generation works ungrounded without it):
```bash
cd ai_service
python scripts/ingest.py
```

---

## Design Decisions

**Why LangGraph?** The pipeline was originally three chained function calls inside the `/generate` handler. That worked, but the control flow was implicit — you had to read the handler to know what ran when, and there was no place to attach cross-cutting concerns. Moving it into an explicit `StateGraph` with named nodes (`planner → requirements → architecture → generator → reviewer`) makes the pipeline self-describing, records an execution trace in state (which the tests assert on), and gives future features an obvious seam: conditional edges (e.g. re-planning when the reviewer flags gaps), retries per node, or parallel branches — none of which fit naturally in straight-line code. The refactor deliberately changed no behavior: the same three chains run in the same order with the same arguments, and mock mode is untouched.

**Why Chroma over a hosted vector DB?** The retrieval corpus is 38 documents. A hosted vector DB (Pinecone, Weaviate Cloud, etc.) would add an API key, a network dependency in every environment including CI, latency, and a bill — for a dataset that fits in memory a thousand times over. Chroma runs embedded in the service process, persists to a local directory, and needs zero infrastructure. Two deliberate twists: embeddings are deterministic feature-hashed bag-of-words vectors computed in-process (no model download — Chroma's default embedder pulls an ONNX model from the network, which would break offline CI), and retrieval is strictly best-effort — an empty or missing store falls back to ungrounded generation rather than erroring. If the corpus ever grows to millions of entries or needs cross-service sharing, swapping Chroma for a hosted store is a change confined to `retrieval.py`.

**In-memory vs Redis rate limiter.** Both services rate-limit with in-process maps (IP-keyed in FastAPI, user-keyed in Express). The tradeoff is deliberate: an in-memory limiter is zero-dependency and exactly right for a single-instance deployment (which Render free tier is), but it resets on restart and doesn't share state across replicas — scale to two instances and each enforces its own window, doubling the effective limit. Redis-backed limiting (e.g. `express-rate-limit` + `rate-limit-redis`) fixes both at the cost of running Redis everywhere, including local dev and CI. Until there's more than one replica, that cost buys nothing; the code paths are small and isolated (`checkRateLimit` / `_check_rate_limit`), so the swap is mechanical when it's needed.

---

## License

This project is licensed under the [MIT License](LICENSE).
