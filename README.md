# Projectify

An AI-powered project brief generator for developers. Give it a topic, difficulty level, tech stack, and your available hours per week — it returns a complete project brief with features, milestones, file structure, learning outcomes, and resources.

Built as a microservices architecture with a 3-step LLM chain: idea generation → scope validation → full brief expansion.

**Live:** [projectify-ai.onrender.com](https://projectify-ai.onrender.com/health)

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React     │────▶│  Node.js/Express │────▶│  FastAPI        │
│   Frontend  │     │  Backend (API)   │     │  AI Service     │
│   :3000     │     │  :5000           │     │  :8001          │
└─────────────┘     └──────────────────┘     └─────────────────┘
                            │                         │
                       ┌────▼────┐            ┌───────▼───────┐
                       │ MongoDB │            │  OpenRouter   │
                       │         │            │  (LLM API)    │
                       └─────────┘            └───────────────┘
```

**3-step LLM chain inside the AI service:**
```
Input → Chain 1: Idea Generator → Chain 2: Scope Validator → Chain 3: Expander → Brief
```

Each chain uses `meta-llama/llama-3.3-70b-instruct` via OpenRouter. Falls back to mock mode if no API key is set — useful for local development without burning credits.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | Node.js, Express, JWT auth |
| AI Service | Python, FastAPI, LangChain |
| Database | MongoDB |
| LLM Provider | OpenRouter (Llama 3.3 70B) |
| Containerization | Docker, Docker Compose |
| CI/CD | GitHub Actions |
| Deployment | Render |

---

## Features

- **AI-generated project briefs** — title, description, core features, stretch goals, milestones, file structure, learning outcomes, resources
- **3-step chain architecture** — idea generation, scope validation, and expansion as separate LLM calls with different temperature settings
- **Mock fallback** — works fully without an API key for local development and CI
- **Rate limiting** — 5 requests per minute per IP (AI service) and per user (Node server)
- **Input validation** — Pydantic on the Python side, custom validation on the Node side
- **JWT authentication** — signup, login, token-based access on all protected routes
- **Project persistence** — save, view, and delete generated projects per user

---

## Project Structure

```
Projectify/
├── ai_service/                 # FastAPI AI service
│   ├── chains/
│   │   ├── idea.py             # Chain 1: generates raw project idea
│   │   ├── validate.py         # Chain 2: validates and adjusts scope
│   │   └── expand.py           # Chain 3: expands into full brief
│   ├── models/
│   │   └── schemas.py          # Pydantic request/response schemas
│   ├── tests/
│   │   ├── conftest.py
│   │   └── test_ai_service.py  # 54 tests
│   ├── main.py                 # FastAPI app, rate limiting, validation
│   ├── requirements.txt
│   └── Dockerfile
├── server/                     # Node.js Express backend
│   ├── routes/
│   │   ├── auth.js             # Signup, login
│   │   ├── generate.js         # Calls AI service, saves to DB
│   │   └── projects.js         # CRUD for saved projects
│   ├── models/
│   │   ├── User.js
│   │   └── Project.js
│   ├── middleware/
│   │   └── auth.js             # JWT verification
│   ├── tests/
│   │   └── server.test.js      # 43 tests
│   ├── index.js
│   ├── jest.config.json
│   └── Dockerfile
├── client/                     # React frontend
│   └── Dockerfile
├── .github/
│   └── workflows/
│       └── ci.yml              # CI/CD pipeline
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
  "scope_notes": "Scope looks appropriate."
}
```

**Rate limit:** 5 requests per 60 seconds per IP.

#### `GET /health`
```json
{"status": "ok", "mode": "llm", "rate_limit": "5 requests per 60s"}
```

### Backend Server (port 5000)

All `/api/generate` and `/api/projects` routes require `Authorization: Bearer <token>`.

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/generate` | Generate and save a project brief |
| GET | `/api/projects` | Get all projects for logged-in user |
| DELETE | `/api/projects/:id` | Delete a project |
| GET | `/api/health` | Health check with DB status |

---

## Running Tests

**Python (54 tests):**
```bash
cd ai_service
pytest tests/ -v
```

**Node.js (43 tests):**
```bash
cd server
npm test
```

Tests run in full mock/in-memory mode — no API keys or real database needed.

**What's tested:**
- Health endpoint and mode reporting
- `/generate` happy path — response shape, all difficulty levels
- Input validation — 11 invalid payload cases
- Rate limiting — window enforcement and reset
- Auth — signup, login, JWT structure, password hashing
- AI service error handling — 503, 504, 429 mapping
- Project CRUD — user isolation, sort order, ownership checks
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
| `PORT` | server | Server port (default: 5000) |
| `MONGO_URI` | server | MongoDB connection string |
| `JWT_SECRET` | server | Secret for signing JWTs |
| `AI_SERVICE_URL` | server | URL of the AI service |
