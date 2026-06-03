"""
pytest configuration and shared fixtures for AI service tests.
"""
import pytest
import os

# Force mock mode — set to empty string so load_dotenv() in main.py
# cannot override with values from .env file.
os.environ["OPENROUTER_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = ""
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ["RATE_LIMIT_WINDOW"] = "1"
os.environ["RATE_LIMIT_MAX"] = "5"

@pytest.fixture(autouse=True)
def clear_rate_store():
    """
    Clear the in-memory rate limit store before every test.
    Without this, rate limiting from one test bleeds into the next.
    """
    from main import _rate_store
    _rate_store.clear()
    yield
    _rate_store.clear()
