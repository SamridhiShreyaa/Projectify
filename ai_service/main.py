"""
Projectify AI Service — FastAPI entry point

Changes from original:
- Added input validation (Pydantic constraints)
- Added rate limiting (reads env vars at call time so tests can override)
- Added /health endpoint that reports real vs mock mode
- CORS locked to specific origins in production
"""
import os
import time
from collections import defaultdict
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from models.schemas import GenerateRequest, ProjectOutput, ReviewRequest, ReviewOutput
from graph import run_pipeline
from chains.review import (
    review_repo,
    InvalidRepoURLError,
    RepoNotFoundError,
    GitHubRateLimitError,
)
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Projectify AI Service",
    description="LLM-powered project idea generator using chained AI processing",
    version="2.0.0",
)

# ---------- CORS ----------
# In production, replace "*" with your actual frontend URL
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Simple in-memory rate limiter ----------
# Keyed by IP. Allows RATE_LIMIT_MAX requests per RATE_LIMIT_WINDOW seconds.
# For production, replace this with Redis-backed rate limiting.
# Values are read at call time (not module load time) so tests can override via env vars.
_rate_store: dict = defaultdict(list)


def _check_rate_limit(ip: str):
    max_requests = int(os.getenv("RATE_LIMIT_MAX", "5"))
    window_seconds = int(os.getenv("RATE_LIMIT_WINDOW", "60"))

    now = time.time()
    window_start = now - window_seconds
    _rate_store[ip] = [t for t in _rate_store[ip] if t > window_start]

    if len(_rate_store[ip]) >= max_requests:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {max_requests} requests per {window_seconds}s."
        )
    _rate_store[ip].append(now)


# ---------- Input validation ----------
VALID_DIFFICULTIES = {"beginner", "intermediate", "advanced"}


def _validate_request(request: GenerateRequest):
    errors = []

    if not request.topic or len(request.topic.strip()) < 3:
        errors.append("topic must be at least 3 characters")
    if len(request.topic) > 200:
        errors.append("topic must be under 200 characters")

    if request.difficulty not in VALID_DIFFICULTIES:
        errors.append(f"difficulty must be one of: {', '.join(VALID_DIFFICULTIES)}")

    if not request.stack or len(request.stack.strip()) < 2:
        errors.append("stack must be at least 2 characters")
    if len(request.stack) > 200:
        errors.append("stack must be under 200 characters")

    if request.hours_per_week < 1 or request.hours_per_week > 80:
        errors.append("hours_per_week must be between 1 and 80")

    if errors:
        raise HTTPException(status_code=422, detail=errors)


# ---------- Routes ----------
@app.post("/generate", response_model=ProjectOutput)
async def generate_project(request: GenerateRequest, http_request: Request):
    # Rate limit by IP
    client_ip = http_request.client.host if http_request.client else "unknown"
    _check_rate_limit(client_ip)

    # Validate inputs
    _validate_request(request)

    try:
        # LangGraph pipeline: planner → requirements → architecture → generator → reviewer
        final_state = run_pipeline(
            topic=request.topic.strip(),
            difficulty=request.difficulty,
            stack=request.stack.strip(),
            hours_per_week=request.hours_per_week,
        )
        return final_state["project"]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@app.post("/review-repo", response_model=ReviewOutput)
async def review_repository(request: ReviewRequest, http_request: Request):
    client_ip = http_request.client.host if http_request.client else "unknown"
    _check_rate_limit(client_ip)

    try:
        return review_repo(request.repo_url)
    except InvalidRepoURLError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RepoNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except GitHubRateLimitError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Review failed: {str(e)}")


@app.get("/health")
def health():
    has_key = bool(os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY"))
    max_requests = int(os.getenv("RATE_LIMIT_MAX", "5"))
    window_seconds = int(os.getenv("RATE_LIMIT_WINDOW", "60"))
    return {
        "status": "ok",
        "mode": "llm" if has_key else "mock",
        "rate_limit": f"{max_requests} requests per {window_seconds}s",
    }


# ---------- Global error handler ----------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )
