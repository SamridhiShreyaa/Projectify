# Projectify

**AI-Powered Project Idea Generator** — A full-stack application that generates complete project briefs using a chained AI pipeline.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│   React     │────▶│  Node.js    │────▶│  FastAPI          │
│   Frontend  │     │  Express    │     │  AI Service       │
│   (Vite)    │◀────│  API Gateway│◀────│  (LangChain)      │
│   :3000     │     │  :5000      │     │  :8001            │
└─────────────┘     └──────┬──────┘     └──────────────────┘
                           │
                    ┌──────▼──────┐
                    │  MongoDB    │
                    │  Database   │
                    └─────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Tailwind CSS, React Router, Vite |
| Backend | Node.js, Express, MongoDB, JWT |
| AI Service | Python, FastAPI, LangChain (mock mode) |

## How It Works

1. User fills in: **topic**, **difficulty**, **stack**, **hours/week**
2. Request goes: React → Node.js → FastAPI AI Service
3. AI Service runs a 3-step chain:
   - **Chain 1**: Generate raw project idea → JSON
   - **Chain 2**: Validate scope & difficulty → adjusted JSON
   - **Chain 3**: Expand into milestones, structure, resources → final JSON
4. Result saved to MongoDB, displayed to user

## Quick Start

### Prerequisites
- Node.js v18+
- Python 3.10+
- MongoDB (running locally on port 27017)

### 1. AI Service
```bash
cd ai_service
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

### 2. Node.js Backend
```bash
cd server
npm install
npm run dev
```

### 3. React Frontend
```bash
cd client
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

## API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Register user |
| POST | `/api/auth/login` | No | Login, returns JWT |
| POST | `/api/generate` | Yes | Generate + save project |
| GET | `/api/projects` | Yes | Get saved projects |
| DELETE | `/api/projects/:id` | Yes | Delete a project |

## Project Structure

```
projectify/
├── client/              # React frontend (Vite)
│   ├── src/
│   │   ├── api/         # Axios instance
│   │   ├── components/  # Reusable components
│   │   ├── context/     # Auth context
│   │   ├── pages/       # Page components
│   │   └── App.jsx      # Router setup
│   └── index.html
├── server/              # Node.js Express API gateway
│   ├── models/          # Mongoose schemas
│   ├── routes/          # API routes
│   ├── middleware/       # JWT auth middleware
│   └── index.js         # Server entry
├── ai_service/          # Python FastAPI AI service
│   ├── chains/          # AI processing chains
│   ├── models/          # Pydantic schemas
│   └── main.py          # FastAPI entry
├── docker-compose.yml
└── README.md
```

## Environment Variables

### `ai_service/.env`
```
OPENAI_API_KEY=your_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

### `server/.env`
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/projectify
JWT_SECRET=your_secret_here
AI_SERVICE_URL=http://localhost:8001
```

## Current Mode

The AI service is running in **mock mode** — it generates realistic project ideas using templates and heuristics instead of calling an LLM. To switch to real LLM mode, replace the mock chain functions with LangChain + OpenAI calls.
