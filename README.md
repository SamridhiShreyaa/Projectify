# Projectify

An AI-powered, gamified project platform for developers. Give it a topic, difficulty, tech stack, and your weekly hours, and it forges a complete project brief ("quest") — features, milestones, file structure, an architecture diagram, downloadable starter code, learning outcomes, and resources. Then it closes the loop: build the project, **turn in your GitHub repo**, and the AI verifies your work against the original brief — awarding XP and achievements for what you actually shipped. Publish quests to a public board, browse and accept others', and show it all off on a public adventurer profile.

---

## Features

**Generate**
- **Choose your quest** — every generation first proposes 3 distinct project options; expand each card to read the details, then accept the one you like (only your pick is saved and fully expanded)
- AI-generated project briefs — title, description, core features, stretch goals, milestones, file structure, learning outcomes, resources
- **Copy-paste AI build prompt** on every project — a structured prompt you can hand to ChatGPT/Claude/any LLM to get a step-by-step build plan
- Downloadable starter-code skeletons + one-click Markdown export for each brief
- Mermaid architecture diagram rendered inline (LLM labels auto-sanitized so diagrams always parse)
- Asynchronous generation — the request returns immediately and the brief fills in via background polling, so slow free-tier LLM calls never time out
- Custom topic/stack input, or forge an "improvement quest" straight from a repo review (stack auto-detected)

**Build & verify (the core loop)**
- Milestone progress tracking with optional target dates
- **Quest turn-in** — link a GitHub repo and the AI scores your build against the brief: per-feature verdicts (evident / partial / not found) with file-path evidence, milestone verdicts, stack match, and a deterministic completion %
- Turn-in history charted per quest so you can watch a project improve across attempts

**Progress & community**
- Server-side XP ledger, levels, and achievements (idempotent, farm-proof)
- Dashboard hub — stats, recent-activity feed, achievements, skill map, and recent quests
- Public Quest Board — publish quests, browse/filter, sort by popularity, and "accept" a quest to clone it into your own log
- Public adventurer profiles (opt-in) + a global XP leaderboard (identities masked)
- Real account settings — display name, change email/password, delete account

**Inspect**
- GitHub repo reviewer — scores architecture clarity, test coverage signal, documentation quality, and hiring signal (1–10)

**Platform**
- LangGraph-orchestrated generation pipeline (planner → requirements → architecture → generator → reviewer)
- RAG grounding — idea generation retrieves similar patterns from a curated corpus in ChromaDB
- Mock/heuristic fallback — works without any API key for local development and CI
- JWT authentication, per-user rate limiting, input validation, and CORS/Helmet security headers

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
│   ├── chains/             # idea, validate, expand, review, verify chains
│   ├── data/                # RAG seed corpus
│   ├── models/              # Pydantic schemas
│   ├── tests/
│   ├── graph.py             # LangGraph pipeline
│   ├── retrieval.py         # Chroma retrieval
│   └── main.py               # FastAPI app
├── server/                # Node.js Express backend
│   ├── routes/               # auth, generate, review, projects, stats, me, public
│   ├── models/                # User, Project, Review, XpEvent
│   ├── middleware/             # JWT auth, rate limiter
│   ├── config/                 # XP + achievement catalogs
│   ├── utils/                   # XP ledger, handle generation
│   └── index.js
├── client/                # React frontend
│   ├── src/pages/            # Home, Dashboard, Result, Saved, Gallery, Profile, Adventurer, Review, Share, auth
│   ├── src/components/       # QuestBrief, TurnInReport, Milestone, ProjectCard, ...
│   └── src/utils/            # XP mirror, review labels, markdown export
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

1. Sign up / log in — you land on your **Dashboard** (stats, activity, recent quests).
2. From the Quests page, enter a topic, difficulty, tech stack, and hours per week, then **scout quests** — pick from 3 project options (expand each for details, or copy its AI build prompt).
3. Track milestones, download the starter-code zip or export Markdown, copy the AI build prompt, and share a read-only link.
4. Build the project, then **Turn In Quest** with your GitHub repo URL — the AI verifies it against the brief and awards XP.
5. Publish a quest to the **Quest Board**, or accept someone else's; opt in to a public **adventurer profile** from Settings.
6. Paste a public GitHub repo URL into the Inspect page to get portfolio-readiness scores.

Or call the AI service directly (it runs standalone in mock mode without a key):
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
| POST | `/ideas` | Generate 3 distinct project options to choose from |
| POST | `/generate` | Expand a project brief (optionally from a `chosen_idea`) |
| POST | `/review-repo` | Score a public GitHub repo |
| POST | `/verify-quest` | Verify a repo against a project brief (turn-in) |
| GET | `/health` | Health check |

### Backend Server (port 5000)
Auth, health, and `/api/public/*` are open; everything else requires `Authorization: Bearer <token>`.

**Auth & account**
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/signup` · `/api/auth/login` | Register / login, returns JWT + name |
| GET | `/api/me` | Current user's account + identity settings |
| PATCH | `/api/me/profile` · `/email` · `/password` · `/public-profile` | Update name / email / password / profile visibility |
| DELETE | `/api/me` | Delete account (cascades all owned data) |

**Quests**
| Method | Route | Description |
|---|---|---|
| POST | `/api/generate/options` | Get 3 project options to choose from (nothing saved) |
| POST | `/api/generate` | Start generation — returns `202` + a pending project (accepts `chosen_idea`) |
| GET | `/api/projects` · `/api/projects/:id` | List / fetch the user's quests |
| PATCH | `/api/projects/:id/progress` · `/milestone-dates` | Update milestone completion / target dates |
| POST | `/api/projects/:id/turn-in` | Verify a repo against the brief, award XP |
| GET | `/api/projects/:id/turn-ins` | Turn-in attempt history |
| POST · DELETE | `/api/projects/:id/share` · `/publish` | Toggle share link / Quest Board listing |
| POST | `/api/projects/accept` | Clone a published quest into your log |
| DELETE | `/api/projects/:id` | Delete a quest |

**Reviews, stats & public**
| Method | Route | Description |
|---|---|---|
| POST · GET | `/api/review` | Review a repo (saved) / list past reviews |
| GET | `/api/stats` | XP, level, counts, achievements, recent activity |
| GET | `/api/public/gallery` · `/gallery/:id` | Browse published quests / one brief |
| GET | `/api/public/leaderboard` | Top adventurers by XP (masked) |
| GET | `/api/public/adventurer/:handle` | Public opt-in profile |
| GET | `/api/public/projects/:token` | Read-only shared quest |
| GET | `/api/health` | Health check with DB status |

---

## Environment Variables

| Variable | Service | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | ai_service | OpenRouter API key for LLM calls |
| `OPENROUTER_BASE_URL` | ai_service | OpenRouter base URL |
| `GITHUB_TOKEN` | ai_service | Optional GitHub token — lifts the repo API cap from 60 to 5000 req/hr |
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
