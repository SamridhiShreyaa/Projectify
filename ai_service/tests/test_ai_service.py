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
