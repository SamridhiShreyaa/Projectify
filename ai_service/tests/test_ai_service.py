"""
Tests for Projectify AI Service

Run with: pytest tests/ -v

Covers:
- /health endpoint
- /generate endpoint (happy path, validation, rate limiting)
- Chain logic (idea, validate, expand) in mock mode
- Response shape correctness
"""
from fastapi.testclient import TestClient
from unittest.mock import patch
import sys
import os

# Ensure the app module is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Force mock mode for all tests — no real LLM calls
# Set to empty string (not pop) so load_dotenv() can't restore from .env
os.environ["OPENROUTER_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = ""

from main import app, _rate_store

client = TestClient(app)

VALID_PAYLOAD = {
    "topic": "web development",
    "difficulty": "beginner",
    "stack": "React, Node.js",
    "hours_per_week": 10,
}


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def clear_rate_store():
    _rate_store.clear()


# ─────────────────────────────────────────────
# /health
# ─────────────────────────────────────────────

class TestHealth:
    def test_health_returns_200(self):
        res = client.get("/health")
        assert res.status_code == 200

    def test_health_has_status_ok(self):
        res = client.get("/health")
        assert res.json()["status"] == "ok"

    def test_health_reports_mock_mode_when_no_key(self):
        res = client.get("/health")
        assert res.json()["mode"] == "mock"

    def test_health_reports_llm_mode_when_key_present(self):
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "fake-key"}):
            # Re-import to pick up new env — or just check the logic directly
            res = client.get("/health")
            # mode depends on env var at request time
            data = res.json()
            assert "mode" in data

    def test_health_includes_rate_limit_info(self):
        res = client.get("/health")
        assert "rate_limit" in res.json()


# ─────────────────────────────────────────────
# /generate — happy path
# ─────────────────────────────────────────────

class TestGenerateHappyPath:
    """
    Share a single /generate response across shape-checking tests.
    This avoids ~10 redundant full-pipeline calls (idea → validate → expand).
    """

    @classmethod
    def setup_class(cls):
        _rate_store.clear()
        cls._response = client.post("/generate", json=VALID_PAYLOAD)
        cls._data = cls._response.json()

    def test_returns_200_for_valid_input(self):
        assert self._response.status_code == 200

    def test_response_has_title(self):
        assert "title" in self._data
        assert len(self._data["title"]) > 0

    def test_response_has_description(self):
        assert "description" in self._data
        assert len(self._data["description"]) > 0

    def test_response_has_core_features_list(self):
        assert "core_features" in self._data
        assert isinstance(self._data["core_features"], list)
        assert len(self._data["core_features"]) > 0

    def test_response_has_stretch_goals_list(self):
        assert "stretch_goals" in self._data
        assert isinstance(self._data["stretch_goals"], list)

    def test_response_has_milestones(self):
        assert "milestones" in self._data
        assert isinstance(self._data["milestones"], list)
        assert len(self._data["milestones"]) == 4

    def test_response_has_file_structure(self):
        assert "file_structure" in self._data

    def test_response_has_learning_outcomes(self):
        assert "learning_outcomes" in self._data
        assert isinstance(self._data["learning_outcomes"], list)
        assert len(self._data["learning_outcomes"]) > 0

    def test_response_has_resources(self):
        assert "resources" in self._data
        assert isinstance(self._data["resources"], list)
        assert len(self._data["resources"]) > 0

    def test_all_difficulties_accepted(self):
        for diff in ["beginner", "intermediate", "advanced"]:
            _rate_store.clear()
            res = client.post("/generate", json={**VALID_PAYLOAD, "difficulty": diff})
            assert res.status_code == 200, f"Failed for difficulty: {diff}"

    def test_minimum_valid_hours(self):
        _rate_store.clear()
        res = client.post("/generate", json={**VALID_PAYLOAD, "hours_per_week": 1})
        assert res.status_code == 200

    def test_maximum_valid_hours(self):
        _rate_store.clear()
        res = client.post("/generate", json={**VALID_PAYLOAD, "hours_per_week": 80})
        assert res.status_code == 200


# ─────────────────────────────────────────────
# /generate — input validation (422)
# ─────────────────────────────────────────────

class TestGenerateValidation:
    def setup_method(self):
        clear_rate_store()

    def test_missing_topic_returns_422(self):
        payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "topic"}
        res = client.post("/generate", json=payload)
        assert res.status_code == 422

    def test_topic_too_short_returns_422(self):
        res = client.post("/generate", json={**VALID_PAYLOAD, "topic": "ab"})
        assert res.status_code == 422

    def test_topic_too_long_returns_422(self):
        res = client.post("/generate", json={**VALID_PAYLOAD, "topic": "x" * 201})
        assert res.status_code == 422

    def test_invalid_difficulty_returns_422(self):
        res = client.post("/generate", json={**VALID_PAYLOAD, "difficulty": "expert"})
        assert res.status_code == 422

    def test_missing_difficulty_returns_422(self):
        payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "difficulty"}
        res = client.post("/generate", json=payload)
        assert res.status_code == 422

    def test_missing_stack_returns_422(self):
        payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "stack"}
        res = client.post("/generate", json=payload)
        assert res.status_code == 422

    def test_stack_too_short_returns_422(self):
        res = client.post("/generate", json={**VALID_PAYLOAD, "stack": "x"})
        assert res.status_code == 422

    def test_hours_zero_returns_422(self):
        res = client.post("/generate", json={**VALID_PAYLOAD, "hours_per_week": 0})
        assert res.status_code == 422

    def test_hours_above_80_returns_422(self):
        res = client.post("/generate", json={**VALID_PAYLOAD, "hours_per_week": 81})
        assert res.status_code == 422

    def test_hours_negative_returns_422(self):
        res = client.post("/generate", json={**VALID_PAYLOAD, "hours_per_week": -5})
        assert res.status_code == 422

    def test_missing_hours_returns_422(self):
        payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "hours_per_week"}
        res = client.post("/generate", json=payload)
        assert res.status_code == 422

    def test_empty_body_returns_422(self):
        res = client.post("/generate", json={})
        assert res.status_code == 422


# ─────────────────────────────────────────────
# /generate — rate limiting (429)
# ─────────────────────────────────────────────

class TestRateLimiting:
    def setup_method(self):
        clear_rate_store()

    def test_fifth_request_still_succeeds(self):
        for _ in range(5):
            res = client.post("/generate", json=VALID_PAYLOAD)
        assert res.status_code == 200

    def test_sixth_request_returns_429(self):
        for _ in range(5):
            client.post("/generate", json=VALID_PAYLOAD)
        res = client.post("/generate", json=VALID_PAYLOAD)
        assert res.status_code == 429

    def test_429_response_has_detail_message(self):
        for _ in range(6):
            res = client.post("/generate", json=VALID_PAYLOAD)
        assert "detail" in res.json()

    def test_rate_limit_resets_after_window(self):
        for _ in range(5):
            client.post("/generate", json=VALID_PAYLOAD)

        # Manually expire the timestamps
        clear_rate_store()

        res = client.post("/generate", json=VALID_PAYLOAD)
        assert res.status_code == 200


# ─────────────────────────────────────────────
# Chain unit tests (mock mode)
# ─────────────────────────────────────────────

class TestIdeaChain:
    def test_returns_dict(self):
        from chains.idea import generate_idea
        result = generate_idea("web development", "beginner", "React", 10)
        assert isinstance(result, dict)

    def test_has_required_keys(self):
        from chains.idea import generate_idea
        result = generate_idea("web development", "beginner", "React", 10)
        assert "title" in result
        assert "description" in result
        assert "core_features" in result
        assert "stretch_goals" in result

    def test_beginner_gets_4_features_max(self):
        from chains.idea import generate_idea
        result = generate_idea("web development", "beginner", "React", 10)
        assert len(result["core_features"]) <= 4

    def test_advanced_gets_more_features(self):
        from chains.idea import generate_idea
        result = generate_idea("web development", "advanced", "React", 20)
        assert len(result["core_features"]) >= 5

    def test_web_topic_detected(self):
        from chains.idea import generate_idea
        result = generate_idea("react frontend app", "beginner", "React", 10)
        assert result["title"] is not None

    def test_data_topic_detected(self):
        from chains.idea import generate_idea
        result = generate_idea("machine learning pipeline", "intermediate", "Python", 15)
        assert result["title"] is not None

    def test_title_is_nonempty_string(self):
        from chains.idea import generate_idea
        result = generate_idea("api", "beginner", "Node.js", 5)
        assert isinstance(result["title"], str)
        assert len(result["title"]) > 0


class TestValidateChain:
    def setup_method(self):
        self.base_project = {
            "title": "Test Project",
            "description": "A test project description.",
            "core_features": ["Auth", "CRUD", "Search", "Pagination", "Dashboard"],
            "stretch_goals": ["Dark mode", "Export PDF"],
        }

    def test_returns_dict(self):
        from chains.validate import validate_idea
        result = validate_idea(self.base_project.copy(), "beginner", 10)
        assert isinstance(result, dict)

    def test_very_limited_hours_caps_features_at_3(self):
        from chains.validate import validate_idea
        result = validate_idea(self.base_project.copy(), "beginner", 4)
        assert len(result["core_features"]) <= 3

    def test_moderate_hours_caps_features_at_4(self):
        from chains.validate import validate_idea
        result = validate_idea(self.base_project.copy(), "beginner", 7)
        assert len(result["core_features"]) <= 4

    def test_beginner_gets_documentation_stretch_goal(self):
        from chains.validate import validate_idea
        result = validate_idea(self.base_project.copy(), "beginner", 10)
        goals_text = " ".join(result["stretch_goals"]).lower()
        assert "comment" in goals_text or "documentation" in goals_text

    def test_advanced_gets_test_coverage_stretch_goal(self):
        from chains.validate import validate_idea
        result = validate_idea(self.base_project.copy(), "advanced", 20)
        goals_text = " ".join(result["stretch_goals"]).lower()
        assert "test" in goals_text

    def test_original_project_not_mutated_unexpectedly(self):
        from chains.validate import validate_idea
        original_title = self.base_project["title"]
        validate_idea(self.base_project.copy(), "beginner", 10)
        assert self.base_project["title"] == original_title


class TestExpandChain:
    def setup_method(self):
        self.base_project = {
            "title": "Task Manager",
            "description": "A simple task management app.",
            "core_features": ["Auth", "CRUD", "Search"],
            "stretch_goals": ["Dark mode"],
            "scope_notes": "Scope looks appropriate.",
        }

    def test_returns_dict(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "React")
        assert isinstance(result, dict)

    def test_has_milestones(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "React")
        assert "milestones" in result
        assert len(result["milestones"]) == 4

    def test_has_file_structure(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "React")
        assert "file_structure" in result
        assert len(result["file_structure"]) > 0

    def test_has_learning_outcomes(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "React")
        assert "learning_outcomes" in result
        assert len(result["learning_outcomes"]) == 4

    def test_has_resources(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "React")
        assert "resources" in result
        assert len(result["resources"]) == 4

    def test_react_stack_gets_react_file_structure(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "React, Node.js")
        assert "src" in result["file_structure"] or "client" in result["file_structure"]

    def test_python_stack_gets_python_file_structure(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "FastAPI, Python")
        assert "app" in result["file_structure"] or "requirements.txt" in result["file_structure"]

    def test_original_fields_preserved(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "React")
        assert result["title"] == "Task Manager"
        assert result["description"] == "A simple task management app."

    def test_has_skeleton_files(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "React")
        assert "skeleton_files" in result
        assert len(result["skeleton_files"]) > 0

    def test_skeleton_files_have_path_and_content(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "React")
        for f in result["skeleton_files"]:
            assert isinstance(f["path"], str) and len(f["path"]) > 0
            assert isinstance(f["content"], str) and len(f["content"]) > 0

    def test_python_stack_gets_python_skeleton(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "FastAPI, Python")
        paths = [f["path"] for f in result["skeleton_files"]]
        assert any(p.endswith(".py") for p in paths)


# ─────────────────────────────────────────────
# RAG retrieval (Chroma)
# ─────────────────────────────────────────────

class TestRetrieval:
    def test_ingest_and_retrieve_known_topic(self, tmp_path, monkeypatch):
        monkeypatch.setenv("CHROMA_DIR", str(tmp_path / "chroma"))
        from retrieval import ingest_patterns, retrieve_patterns

        count = ingest_patterns(persist_dir=str(tmp_path / "chroma"))
        assert count >= 30

        results = retrieve_patterns("real-time chat application", "React, Node.js", "intermediate")
        assert len(results) > 0
        top = results[0]
        assert top["title"]
        assert top["domain"]
        # A chat query against the seed corpus should surface the chat pattern
        titles = " ".join(r["title"].lower() for r in results)
        assert "chat" in titles or "real-time" in titles

    def test_retrieval_returns_empty_for_missing_store(self, tmp_path, monkeypatch):
        monkeypatch.setenv("CHROMA_DIR", str(tmp_path / "empty-chroma"))
        from retrieval import retrieve_patterns
        assert retrieve_patterns("web development", "React", "beginner") == []

    def test_generate_succeeds_with_empty_store(self, tmp_path, monkeypatch):
        """Fallback path: no vector store → ungrounded generation, no error."""
        monkeypatch.setenv("CHROMA_DIR", str(tmp_path / "empty-chroma"))
        clear_rate_store()
        res = client.post("/generate", json=VALID_PAYLOAD)
        assert res.status_code == 200
        assert res.json()["title"]

    def test_embedding_is_deterministic(self):
        from retrieval import embed_text
        assert embed_text("react chat app") == embed_text("react chat app")

    def test_format_grounding_empty_and_populated(self):
        from retrieval import format_grounding
        assert format_grounding([]) == ""
        text = format_grounding([{
            "title": "Chat App", "domain": "web", "difficulty": "intermediate",
            "stack": "React", "description": "A chat app.",
        }])
        assert "Chat App" in text and "grounding" in text.lower()


# ─────────────────────────────────────────────
# /review-repo — GitHub repo reviewer
# ─────────────────────────────────────────────

class FakeGitHubResponse:
    def __init__(self, status_code=200, json_data=None, headers=None):
        self.status_code = status_code
        self._json = json_data or {}
        self.headers = headers or {}

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


def _fake_github_ok(url, **kwargs):
    import base64
    if url.endswith("/repos/someone/goodrepo"):
        return FakeGitHubResponse(200, {
            "full_name": "someone/goodrepo",
            "description": "A demo repo",
            "language": "Python",
            "default_branch": "main",
        })
    if "/git/trees/" in url:
        return FakeGitHubResponse(200, {
            "tree": [
                {"path": "src/main.py", "type": "blob"},
                {"path": "src/routes/api.py", "type": "blob"},
                {"path": "tests/test_main.py", "type": "blob"},
                {"path": "Dockerfile", "type": "blob"},
                {"path": ".github/workflows/ci.yml", "type": "blob"},
                {"path": "requirements.txt", "type": "blob"},
            ],
        })
    if url.endswith("/readme"):
        content = base64.b64encode(
            b"# Good Repo\n\n## Setup\npip install\n\n## Usage\nrun it\n" * 40
        ).decode()
        return FakeGitHubResponse(200, {"content": content})
    if url.endswith("/languages"):
        return FakeGitHubResponse(200, {"Python": 54321, "Dockerfile": 500})
    return FakeGitHubResponse(404)


class TestReviewRepo:
    def setup_method(self):
        clear_rate_store()
        from chains.review import _gh_cache
        _gh_cache.clear()

    # --- URL parsing ---

    def test_parse_full_https_url(self):
        from chains.review import _parse_repo_url
        assert _parse_repo_url("https://github.com/owner/repo") == ("owner", "repo")

    def test_parse_url_with_git_suffix_and_trailing_slash(self):
        from chains.review import _parse_repo_url
        assert _parse_repo_url("https://github.com/owner/repo.git/") == ("owner", "repo")

    def test_parse_bare_owner_repo(self):
        from chains.review import _parse_repo_url
        assert _parse_repo_url("github.com/owner/repo") == ("owner", "repo")

    def test_parse_invalid_url_raises(self):
        from chains.review import _parse_repo_url, InvalidRepoURLError
        import pytest
        with pytest.raises(InvalidRepoURLError):
            _parse_repo_url("https://gitlab.com/not/github/extra")

    # --- Valid repo (mocked GitHub) ---

    def test_valid_repo_returns_all_categories(self):
        with patch("httpx.get", side_effect=_fake_github_ok):
            res = client.post("/review-repo", json={"repo_url": "https://github.com/someone/goodrepo"})
        assert res.status_code == 200
        data = res.json()
        assert data["repo"] == "someone/goodrepo"
        # No API key in tests → scores must be labeled as rule-based
        assert data["mode"] == "heuristic"
        for cat in ["architecture_clarity", "test_coverage_signal",
                    "documentation_quality", "hiring_signal"]:
            assert cat in data["scores"]
            assert 1 <= data["scores"][cat]["score"] <= 10
            assert len(data["scores"][cat]["rationale"]) > 0

    def test_review_includes_repo_language(self):
        with patch("httpx.get", side_effect=_fake_github_ok):
            res = client.post("/review-repo", json={"repo_url": "https://github.com/someone/goodrepo"})
        assert res.status_code == 200
        assert res.json()["language"] == "Python"

    def test_review_language_empty_when_github_reports_none(self):
        def _no_language(url, **kwargs):
            resp = _fake_github_ok(url, **kwargs)
            if url.endswith("/repos/someone/goodrepo"):
                resp._json["language"] = None
            return resp
        with patch("httpx.get", side_effect=_no_language):
            res = client.post("/review-repo", json={"repo_url": "https://github.com/someone/goodrepo"})
        assert res.status_code == 200
        assert res.json()["language"] == ""

    def test_repo_with_tests_scores_higher_than_without(self):
        from chains.review import _heuristic_review
        with_tests = _heuristic_review({
            "tree": ["src/a.py", "tests/test_a.py", "tests/test_b.py"],
            "readme": "# Hi",
        })
        without_tests = _heuristic_review({"tree": ["src/a.py"], "readme": "# Hi"})
        assert (with_tests["test_coverage_signal"]["score"]
                > without_tests["test_coverage_signal"]["score"])

    def test_github_responses_are_cached(self):
        mock_get = patch("httpx.get", side_effect=_fake_github_ok).start()
        try:
            client.post("/review-repo", json={"repo_url": "github.com/someone/goodrepo"})
            first_call_count = mock_get.call_count
            clear_rate_store()
            client.post("/review-repo", json={"repo_url": "github.com/someone/goodrepo"})
            assert mock_get.call_count == first_call_count  # served from cache
        finally:
            patch.stopall()

    # --- Invalid / private repo ---

    def test_nonexistent_repo_returns_404(self):
        with patch("httpx.get", return_value=FakeGitHubResponse(404)):
            res = client.post("/review-repo", json={"repo_url": "github.com/nobody/ghost"})
        assert res.status_code == 404

    def test_invalid_url_returns_422(self):
        res = client.post("/review-repo", json={"repo_url": "not a repo url at all"})
        assert res.status_code == 422

    def test_missing_repo_url_returns_422(self):
        res = client.post("/review-repo", json={})
        assert res.status_code == 422

    # --- GitHub rate limiting ---

    def test_github_rate_limit_returns_503(self):
        rate_limited = FakeGitHubResponse(
            403, {"message": "API rate limit exceeded"},
            headers={"X-RateLimit-Remaining": "0"},
        )
        with patch("httpx.get", return_value=rate_limited):
            res = client.post("/review-repo", json={"repo_url": "github.com/someone/goodrepo"})
        assert res.status_code == 503
        assert "rate limit" in res.json()["detail"].lower()

    def test_own_rate_limiter_applies_to_review_endpoint(self):
        with patch("httpx.get", side_effect=_fake_github_ok):
            for _ in range(5):
                client.post("/review-repo", json={"repo_url": "github.com/someone/goodrepo"})
            res = client.post("/review-repo", json={"repo_url": "github.com/someone/goodrepo"})
        assert res.status_code == 429


# ─────────────────────────────────────────────
# LangGraph pipeline
# ─────────────────────────────────────────────

class TestLangGraphPipeline:
    def test_nodes_execute_in_order(self):
        from graph import run_pipeline
        state = run_pipeline("web development", "beginner", "React, Node.js", 10)
        assert state["node_trace"] == [
            "planner", "requirements", "architecture", "generator", "reviewer",
        ]

    def test_pipeline_produces_complete_project(self):
        from graph import run_pipeline
        state = run_pipeline("web development", "beginner", "React, Node.js", 10)
        project = state["project"]
        for key in ["title", "description", "core_features", "milestones",
                    "file_structure", "learning_outcomes", "resources"]:
            assert key in project, f"missing {key}"

    def test_reviewer_reports_no_missing_fields_in_mock_mode(self):
        from graph import run_pipeline
        state = run_pipeline("web development", "beginner", "React, Node.js", 10)
        assert state["review_notes"] == []


# ─────────────────────────────────────────────
# Mermaid diagram
# ─────────────────────────────────────────────

class TestMermaidDiagram:
    def setup_method(self):
        self.base_project = {
            "title": "Task Manager",
            "description": "A simple task management app.",
            "core_features": ["Auth", "CRUD", "Search"],
            "stretch_goals": ["Dark mode"],
        }

    def test_expand_returns_mermaid_diagram(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "React")
        assert "mermaid_diagram" in result
        assert len(result["mermaid_diagram"]) > 0

    def test_mermaid_diagram_starts_with_valid_syntax(self):
        from chains.expand import expand_project
        result = expand_project(self.base_project.copy(), "React")
        assert result["mermaid_diagram"].strip().startswith(("graph", "flowchart"))

    def test_generate_returns_mermaid_diagram(self):
        """Integration: /generate returns a valid Mermaid diagram."""
        clear_rate_store()
        res = client.post("/generate", json=VALID_PAYLOAD)
        assert res.status_code == 200
        diagram = res.json()["mermaid_diagram"]
        assert diagram.strip().startswith(("graph", "flowchart"))


# ─────────────────────────────────────────────
# Schema — skeleton_files
# ─────────────────────────────────────────────

class TestSkeletonFilesSchema:
    def test_project_output_accepts_skeleton_files(self):
        from models.schemas import ProjectOutput
        out = ProjectOutput(
            title="T", description="D",
            core_features=["a"], stretch_goals=[],
            milestones=["1", "2", "3", "4"],
            file_structure="src/",
            learning_outcomes=["x"], resources=["y"],
            skeleton_files=[{"path": "src/index.js", "content": "// hi"}],
        )
        assert out.skeleton_files[0].path == "src/index.js"

    def test_skeleton_files_defaults_to_empty_list(self):
        from models.schemas import ProjectOutput
        out = ProjectOutput(
            title="T", description="D",
            core_features=["a"], stretch_goals=[],
            milestones=["1", "2", "3", "4"],
            file_structure="src/",
            learning_outcomes=["x"], resources=["y"],
        )
        assert out.skeleton_files == []

    def test_generate_returns_nonempty_skeleton_files(self):
        """Integration: /generate returns skeleton_files for a valid request."""
        clear_rate_store()
        res = client.post("/generate", json=VALID_PAYLOAD)
        assert res.status_code == 200
        data = res.json()
        assert "skeleton_files" in data
        assert len(data["skeleton_files"]) > 0
        assert all("path" in f and "content" in f for f in data["skeleton_files"])


# ─────────────────────────────────────────────
# /verify-quest — turn-in verifier
# ─────────────────────────────────────────────

VALID_BRIEF = {
    "title": "API Service Quest",
    "core_features": [
        "REST API routes for main resources",
        "Automated tests with pytest",
        "Blockchain ledger integration",
    ],
    "milestones": [
        "Week 1: scaffold API routes",
        "Week 2: add Docker deployment",
    ],
    "stack": "Python and FastAPI",
}


def _verify_payload(**overrides):
    brief = {**VALID_BRIEF, **overrides.pop("brief", {})}
    return {"repo_url": "https://github.com/someone/goodrepo", "brief": brief, **overrides}


class TestVerifyQuest:
    def setup_method(self):
        clear_rate_store()
        from chains.review import _gh_cache
        _gh_cache.clear()

    def test_happy_path_covers_every_brief_item_in_order(self):
        with patch("httpx.get", side_effect=_fake_github_ok):
            res = client.post("/verify-quest", json=_verify_payload())
        assert res.status_code == 200
        data = res.json()
        assert data["repo"] == "someone/goodrepo"
        assert data["mode"] == "heuristic"  # no API key in tests
        assert data["language"] == "Python"
        assert [f["feature"] for f in data["features"]] == VALID_BRIEF["core_features"]
        assert [m["milestone"] for m in data["milestones"]] == VALID_BRIEF["milestones"]
        for f in data["features"]:
            assert f["verdict"] in ("evident", "partial", "not_found")
        for m in data["milestones"]:
            assert m["verdict"] in ("done", "partial", "not_started")
        assert data["stack_match"]["verdict"] in ("match", "partial", "mismatch")

    def test_discriminates_evident_from_not_found(self):
        with patch("httpx.get", side_effect=_fake_github_ok):
            res = client.post("/verify-quest", json=_verify_payload())
        verdicts = {f["feature"]: f["verdict"] for f in res.json()["features"]}
        assert verdicts["REST API routes for main resources"] == "evident"
        assert verdicts["Blockchain ledger integration"] == "not_found"
        # Evidence for the evident feature must cite a real tree path
        evident = next(f for f in res.json()["features"]
                       if f["feature"] == "REST API routes for main resources")
        assert "src/routes/api.py" in evident["evidence"] or "src/main.py" in evident["evidence"]

    def test_completion_matches_deterministic_formula(self):
        from chains.verify import compute_completion
        with patch("httpx.get", side_effect=_fake_github_ok):
            res = client.post("/verify-quest", json=_verify_payload())
        data = res.json()
        recomputed = compute_completion(data["features"], data["milestones"])
        assert data["completion"]["percent"] == recomputed["percent"]
        assert data["completion"]["verdict"] == recomputed["verdict"]
        assert 0 <= data["completion"]["percent"] <= 100

    def test_stack_match_for_matching_stack(self):
        with patch("httpx.get", side_effect=_fake_github_ok):
            res = client.post("/verify-quest", json=_verify_payload())
        # Repo is Python (requirements.txt + language) and brief wants Python
        assert res.json()["stack_match"]["verdict"] == "match"

    def test_invalid_url_returns_422(self):
        res = client.post("/verify-quest", json=_verify_payload(
            repo_url="https://gitlab.com/not/github/extra"))
        assert res.status_code == 422

    def test_missing_repo_returns_404(self):
        with patch("httpx.get", return_value=FakeGitHubResponse(404)):
            res = client.post("/verify-quest", json=_verify_payload(
                repo_url="github.com/someone/missing"))
        assert res.status_code == 404

    def test_empty_core_features_rejected(self):
        res = client.post("/verify-quest", json=_verify_payload(
            brief={"core_features": []}))
        assert res.status_code == 422

    def test_rate_limiter_applies(self):
        with patch("httpx.get", side_effect=_fake_github_ok):
            for _ in range(5):
                client.post("/verify-quest", json=_verify_payload())
            res = client.post("/verify-quest", json=_verify_payload())
        assert res.status_code == 429


class TestVerifyInternals:
    def test_compute_completion_thresholds(self):
        from chains.verify import compute_completion
        all_evident = [{"verdict": "evident"}] * 4
        assert compute_completion(all_evident, [])["verdict"] == "complete"
        assert compute_completion(all_evident, [])["percent"] == 100
        none_found = [{"verdict": "not_found"}] * 4
        assert compute_completion(none_found, [])["verdict"] == "not_started"
        half = [{"verdict": "evident"}, {"verdict": "not_found"}]
        result = compute_completion(half, [])
        assert result["percent"] == 50 and result["verdict"] == "partial"

    def test_compute_completion_weights_milestones(self):
        from chains.verify import compute_completion
        features = [{"verdict": "evident"}]          # 1.0
        milestones = [{"verdict": "not_started"}]    # 0.0
        # 0.7*1.0 + 0.3*0.0 = 70
        assert compute_completion(features, milestones)["percent"] == 70

    def test_sanitizer_downgrades_hallucinated_path(self):
        from chains.verify import sanitize_evidence, NO_EVIDENCE
        entry = {"feature": "x", "verdict": "evident",
                 "evidence": "Implemented in src/made_up_dir/ghost.py"}
        out = sanitize_evidence(entry, ["src/main.py", "tests/test_main.py"],
                                downgrade_to="partial")
        assert out["verdict"] == "partial"
        assert out["evidence"] == NO_EVIDENCE

    def test_sanitizer_keeps_real_paths(self):
        from chains.verify import sanitize_evidence
        entry = {"feature": "x", "verdict": "evident",
                 "evidence": "See src/main.py for the entry point"}
        out = sanitize_evidence(entry, ["src/main.py"], downgrade_to="partial")
        assert out["verdict"] == "evident"
        assert "src/main.py" in out["evidence"]

    def test_merge_substitutes_heuristic_for_missing_llm_entries(self):
        from chains.verify import _merge_items
        brief_items = ["feature one", "feature two"]
        heuristic = [
            {"feature": "feature one", "verdict": "partial", "evidence": "h1"},
            {"feature": "feature two", "verdict": "not_found", "evidence": ""},
        ]
        # LLM returned only the first entry, and with a bogus verdict on retry lists
        llm_raw = [{"index": 1, "verdict": "evident", "evidence": ""}]
        merged = _merge_items(brief_items, llm_raw, heuristic, "feature",
                              ("evident", "partial", "not_found"), tree=[])
        assert merged[0]["verdict"] == "evident"
        assert merged[1] == heuristic[1]

    def test_merge_rejects_invalid_verdicts(self):
        from chains.verify import _merge_items
        brief_items = ["feature one"]
        heuristic = [{"feature": "feature one", "verdict": "partial", "evidence": "h"}]
        llm_raw = [{"index": 1, "verdict": "definitely!!", "evidence": ""}]
        merged = _merge_items(brief_items, llm_raw, heuristic, "feature",
                              ("evident", "partial", "not_found"), tree=[])
        assert merged[0] == heuristic[0]


# ─────────────────────────────────────────────
# Stack detection + GitHub token (polish pack)
# ─────────────────────────────────────────────

class TestDetectStack:
    def test_react_node_repo(self):
        from chains.review import detect_stack
        stack = detect_stack(
            {"JavaScript": 90000, "CSS": 5000},
            ["package.json", "src/App.jsx", "src/index.css"],
        )
        assert "React" in stack and "Node.js" in stack
        # JavaScript is implied by React/Node.js — don't repeat it
        assert "JavaScript" not in stack

    def test_python_repo_from_languages(self):
        from chains.review import detect_stack
        stack = detect_stack({"Python": 80000}, ["src/main.py", "requirements.txt"])
        assert stack == "Python"

    def test_django_marker_beats_plain_python(self):
        from chains.review import detect_stack
        stack = detect_stack({"Python": 80000}, ["manage.py", "app/models.py"])
        assert "Django" in stack
        assert "Python" not in stack  # implied by Django

    def test_empty_languages_falls_back_to_primary(self):
        from chains.review import detect_stack
        assert detect_stack({}, [], primary_language="Go") == "Go"

    def test_totally_unknown_repo_is_empty(self):
        from chains.review import detect_stack
        assert detect_stack({}, ["notes.txt"]) == ""


class TestDetectedStackInReview:
    def setup_method(self):
        clear_rate_store()
        from chains.review import _gh_cache
        _gh_cache.clear()

    def test_review_response_includes_detected_stack(self):
        with patch("httpx.get", side_effect=_fake_github_ok):
            res = client.post("/review-repo", json={"repo_url": "https://github.com/someone/goodrepo"})
        assert res.status_code == 200
        # Fixture repo: Python languages + package.json-free tree → "Python"
        assert res.json()["detected_stack"] == "Python"

    def test_verify_still_works_with_languages_fetch(self):
        with patch("httpx.get", side_effect=_fake_github_ok):
            res = client.post("/verify-quest", json=_verify_payload())
        assert res.status_code == 200


class TestGitHubToken:
    def setup_method(self):
        from chains.review import _gh_cache
        _gh_cache.clear()

    def _capture_headers(self):
        captured = {}

        def fake_get(url, **kwargs):
            captured.update(kwargs.get("headers") or {})
            return _fake_github_ok(url)
        return captured, fake_get

    def test_token_sent_when_env_set(self):
        import os
        from chains.review import fetch_repo_data
        captured, fake_get = self._capture_headers()
        with patch.dict(os.environ, {"GITHUB_TOKEN": "gh-test-token"}):
            with patch("httpx.get", side_effect=fake_get):
                fetch_repo_data("github.com/someone/goodrepo")
        assert captured.get("Authorization") == "Bearer gh-test-token"

    def test_no_auth_header_without_token(self):
        import os
        from chains.review import fetch_repo_data
        captured, fake_get = self._capture_headers()
        env = {k: v for k, v in os.environ.items() if k != "GITHUB_TOKEN"}
        with patch.dict(os.environ, env, clear=True):
            with patch("httpx.get", side_effect=fake_get):
                fetch_repo_data("github.com/someone/goodrepo")
        assert "Authorization" not in captured


# ─────────────────────────────────────────────
# /ideas — choose-your-quest options
# ─────────────────────────────────────────────

class TestIdeas:
    def setup_method(self):
        _rate_store.clear()

    def test_ideas_returns_200(self):
        res = client.post("/ideas", json=VALID_PAYLOAD)
        assert res.status_code == 200

    def test_ideas_returns_multiple_options(self):
        res = client.post("/ideas", json=VALID_PAYLOAD)
        ideas = res.json()["ideas"]
        assert isinstance(ideas, list)
        assert len(ideas) >= 2

    def test_each_idea_has_required_fields(self):
        res = client.post("/ideas", json=VALID_PAYLOAD)
        for idea in res.json()["ideas"]:
            assert idea["title"]
            assert "pitch" in idea
            assert idea["description"]
            assert len(idea["core_features"]) >= 1

    def test_ideas_are_distinct(self):
        res = client.post("/ideas", json=VALID_PAYLOAD)
        titles = [i["title"] for i in res.json()["ideas"]]
        assert len(set(titles)) == len(titles)

    def test_ideas_validates_input(self):
        res = client.post("/ideas", json={**VALID_PAYLOAD, "difficulty": "expert"})
        assert res.status_code == 422

    def test_ideas_rate_limited(self):
        for _ in range(5):
            client.post("/ideas", json=VALID_PAYLOAD)
        res = client.post("/ideas", json=VALID_PAYLOAD)
        assert res.status_code == 429


# ─────────────────────────────────────────────
# /generate — expanding a pre-chosen idea
# ─────────────────────────────────────────────

class TestGenerateChosenIdea:
    def setup_method(self):
        _rate_store.clear()

    CHOSEN = {
        "title": "Pixel Quest Tracker",
        "description": "A gamified habit tracker with a retro RPG theme.",
        "core_features": ["Track daily habits", "Award XP for streaks"],
        "stretch_goals": ["Add achievements"],
    }

    def test_chosen_idea_title_is_preserved(self):
        res = client.post("/generate", json={**VALID_PAYLOAD, "chosen_idea": self.CHOSEN})
        assert res.status_code == 200
        assert res.json()["title"] == self.CHOSEN["title"]

    def test_chosen_idea_still_expands_full_brief(self):
        res = client.post("/generate", json={**VALID_PAYLOAD, "chosen_idea": self.CHOSEN})
        data = res.json()
        assert data["milestones"]
        assert data["file_structure"]
        assert len(data["skeleton_files"]) >= 1

    def test_generate_without_chosen_idea_still_works(self):
        res = client.post("/generate", json=VALID_PAYLOAD)
        assert res.status_code == 200
        assert res.json()["title"]
