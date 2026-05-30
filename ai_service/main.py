from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models.schemas import GenerateRequest, ProjectOutput
from chains.idea import generate_idea
from chains.validate import validate_idea
from chains.expand import expand_project
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Projectify AI Service",
    description="LLM-powered project idea generator using chained AI processing",
    version="1.0.0"
)

# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/generate", response_model=ProjectOutput)
async def generate_project(request: GenerateRequest):
    """
    Generate a full project idea through a 3-step chain:
    1. Generate raw idea based on constraints
    2. Validate scope and difficulty
    3. Expand into full project brief
    """
    try:
        # Chain 1: Generate raw idea
        raw_idea = generate_idea(
            topic=request.topic,
            difficulty=request.difficulty,
            stack=request.stack,
            hours=request.hours_per_week
        )

        # Chain 2: Validate and adjust scope
        validated = validate_idea(
            project=raw_idea,
            difficulty=request.difficulty,
            hours=request.hours_per_week
        )

        # Chain 3: Expand into full brief
        expanded = expand_project(
            project=validated,
            stack=request.stack
        )

        return expanded
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok", "mode": "mock"}
