"""
Chain 4 — GitHub repo reviewer

Fetches a public repo's file tree and README via the GitHub REST API
(unauthenticated), then scores it on architecture clarity, test coverage
signal, documentation quality, and overall hiring signal.

Rate-limit aware: GitHub responses are cached in-memory (TTL) and 403
rate-limit responses raise GitHubRateLimitError instead of crashing.
Falls back to a heuristic reviewer if no LLM API key is configured.
"""
import base64
import os
import re
import time

GITHUB_API = "https://api.github.com"
CACHE_TTL_SECONDS = 600  # GitHub allows 60 unauthenticated requests/hour — cache hard

CATEGORIES = (
    "architecture_clarity",
    "test_coverage_signal",
    "documentation_quality",
    "hiring_signal",
)


# ---------- Errors ----------
class InvalidRepoURLError(Exception):
    """The supplied URL doesn't look like a GitHub repository."""


class RepoNotFoundError(Exception):
    """Repo doesn't exist or is private (GitHub returns 404 for both)."""


class GitHubRateLimitError(Exception):
    """Unauthenticated GitHub API rate limit exhausted."""


# ---------- GitHub fetching (cached) ----------
_gh_cache: dict = {}


def _parse_repo_url(repo_url: str) -> tuple:
    """Accepts https://github.com/owner/repo(.git), github.com/owner/repo, or owner/repo."""
    if not repo_url or not isinstance(repo_url, str):
        raise InvalidRepoURLError("repo_url is required")
    cleaned = repo_url.strip().rstrip("/")
    cleaned = re.sub(r"^https?://", "", cleaned)
    cleaned = re.sub(r"^www\.", "", cleaned)
    cleaned = re.sub(r"^github\.com/", "", cleaned)
    cleaned = re.sub(r"\.git$", "", cleaned)
    parts = cleaned.split("/")
    if len(parts) != 2 or not all(re.fullmatch(r"[A-Za-z0-9_.-]+", p) for p in parts):
        raise InvalidRepoURLError(f"Not a valid GitHub repo URL: {repo_url}")
    return parts[0], parts[1]


def _gh_get(path: str) -> dict:
    """GET a GitHub API path with caching and rate-limit handling."""
    now = time.time()
    cached = _gh_cache.get(path)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    import httpx
    res = httpx.get(
        f"{GITHUB_API}{path}",
        headers={"Accept": "application/vnd.github+json"},
        timeout=15,
        follow_redirects=True,
    )

    if res.status_code == 404:
        raise RepoNotFoundError(f"Repository not found (or private): {path}")
    if res.status_code in (403, 429):
        remaining = res.headers.get("X-RateLimit-Remaining")
        if remaining == "0" or res.status_code == 429:
            raise GitHubRateLimitError(
                "GitHub API rate limit exceeded — try again later."
            )
        raise RepoNotFoundError(f"GitHub refused the request ({res.status_code})")
    res.raise_for_status()

    data = res.json()
    _gh_cache[path] = (now, data)
    return data


def fetch_repo_data(repo_url: str) -> dict:
    """Fetch repo metadata, file tree, and README for a public GitHub repo."""
    owner, repo = _parse_repo_url(repo_url)

    meta = _gh_get(f"/repos/{owner}/{repo}")
    default_branch = meta.get("default_branch", "main")

    tree_data = _gh_get(f"/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1")
    tree = [item["path"] for item in tree_data.get("tree", []) if item.get("type") == "blob"]

    readme = ""
    try:
        readme_data = _gh_get(f"/repos/{owner}/{repo}/readme")
        readme = base64.b64decode(readme_data.get("content", "")).decode("utf-8", "replace")
    except RepoNotFoundError:
        pass  # repo without a README is fine — it just scores lower

    return {
        "full_name": meta.get("full_name", f"{owner}/{repo}"),
        "description": meta.get("description") or "",
        "language": meta.get("language") or "",
        "default_branch": default_branch,
        "tree": tree,
        "readme": readme,
    }


# ---------- LLM reviewer ----------
_REVIEW_PROMPT = None


def _get_prompt():
    global _REVIEW_PROMPT
    if _REVIEW_PROMPT is None:
        from langchain_core.prompts import ChatPromptTemplate
        _REVIEW_PROMPT = ChatPromptTemplate.from_messages([
            ("system", """You are a senior engineer reviewing a GitHub repository as a hiring signal.
Respond ONLY with valid JSON — no markdown fences, no explanation.
Schema:
{{
  "architecture_clarity": {{"score": 1-10, "rationale": "string"}},
  "test_coverage_signal": {{"score": 1-10, "rationale": "string"}},
  "documentation_quality": {{"score": 1-10, "rationale": "string"}},
  "hiring_signal": {{"score": 1-10, "rationale": "string"}}
}}
Each rationale: 1-3 sentences, specific to this repo, mentioning concrete files
or structure you observed. Be fair but honest — most repos are not 9s or 10s."""),
            ("human", """Review this repository:

Repo: {full_name}
Description: {description}
Primary language: {language}

File tree ({file_count} files):
{tree}

README:
{readme}

Score each category 1-10:
1. architecture_clarity — is the code organized into clear layers/modules?
2. test_coverage_signal — do the files suggest real automated testing?
3. documentation_quality — does the README explain setup, usage, and design?
4. hiring_signal — overall: would this repo impress a hiring manager?""")
        ])
    return _REVIEW_PROMPT


def _get_llm():
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

    if not api_key:
        return None

    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model="openrouter/free",
        api_key=api_key,
        base_url=base_url,
        temperature=0.3,
        max_tokens=900,
    )


def review_repo(repo_url: str) -> dict:
    """Fetch and score a GitHub repo. Uses LLM if available, else heuristics."""
    repo_data = fetch_repo_data(repo_url)
    llm = _get_llm()

    if llm:
        try:
            from langchain_core.output_parsers import JsonOutputParser
            parser = JsonOutputParser()
            chain = _get_prompt() | llm | parser
            result = chain.invoke({
                "full_name": repo_data["full_name"],
                "description": repo_data["description"],
                "language": repo_data["language"],
                "file_count": len(repo_data["tree"]),
                "tree": "\n".join(repo_data["tree"][:300]),
                "readme": repo_data["readme"][:6000],
            })
            if _is_valid_review(result):
                return {
                    "repo": repo_data["full_name"],
                    "mode": "llm",
                    "scores": _normalize(result),
                }
            print("[WARN] LLM review malformed, falling back to heuristics")
        except Exception as e:
            print(f"[WARN] LLM review failed, falling back to heuristics: {e}")

    return {
        "repo": repo_data["full_name"],
        "mode": "heuristic",
        "scores": _heuristic_review(repo_data),
    }


def _is_valid_review(result: dict) -> bool:
    if not isinstance(result, dict):
        return False
    for cat in CATEGORIES:
        entry = result.get(cat)
        if not isinstance(entry, dict):
            return False
        score = entry.get("score")
        if not isinstance(score, (int, float)) or not entry.get("rationale"):
            return False
    return True


def _clamp(score) -> int:
    return max(1, min(10, int(round(score))))


def _normalize(result: dict) -> dict:
    return {
        cat: {
            "score": _clamp(result[cat]["score"]),
            "rationale": str(result[cat]["rationale"]),
        }
        for cat in CATEGORIES
    }


# ---------- Heuristic fallback (mock mode) ----------
def _heuristic_review(repo_data: dict) -> dict:
    tree = repo_data["tree"]
    readme = repo_data["readme"]
    lower_tree = [p.lower() for p in tree]

    # Test coverage signal
    test_files = [p for p in lower_tree if "test" in p or "spec" in p or "__tests__" in p]
    test_score = _clamp(2 + min(len(test_files), 6))
    test_rationale = (
        f"Found {len(test_files)} test-related files."
        if test_files else "No test files detected in the file tree."
    )

    # Documentation quality
    doc_score = 2
    doc_points = []
    if readme:
        doc_score += 2
        doc_points.append("has a README")
        if len(readme) > 1500:
            doc_score += 2
            doc_points.append("README is substantial")
        for section in ("setup", "install", "usage", "architecture", "api"):
            if section in readme.lower():
                doc_score += 1
                doc_points.append(f"covers {section}")
    doc_score = _clamp(doc_score)
    doc_rationale = (
        "README " + ", ".join(doc_points) + "." if doc_points else "No README found."
    )

    # Architecture clarity
    arch_score = 3
    arch_points = []
    top_dirs = {p.split("/")[0] for p in tree if "/" in p}
    if len(top_dirs) >= 2:
        arch_score += 2
        arch_points.append("code split across multiple top-level modules")
    for marker, label in [
        ("dockerfile", "containerized"),
        ("docker-compose", "compose setup"),
        (".github/workflows", "CI configured"),
        ("requirements.txt", "pinned Python deps"),
        ("package.json", "managed JS deps"),
    ]:
        if any(marker in p for p in lower_tree):
            arch_score += 1
            arch_points.append(label)
    arch_score = _clamp(arch_score)
    arch_rationale = (
        "Structure signals: " + ", ".join(arch_points) + "."
        if arch_points else "Flat or minimal structure with few organizational signals."
    )

    # Hiring signal — weighted blend of the other three
    hiring_score = _clamp(round(arch_score * 0.35 + test_score * 0.35 + doc_score * 0.3))
    hiring_rationale = (
        f"Blend of architecture ({arch_score}/10), tests ({test_score}/10), "
        f"and docs ({doc_score}/10)."
    )

    return {
        "architecture_clarity": {"score": arch_score, "rationale": arch_rationale},
        "test_coverage_signal": {"score": test_score, "rationale": test_rationale},
        "documentation_quality": {"score": doc_score, "rationale": doc_rationale},
        "hiring_signal": {"score": hiring_score, "rationale": hiring_rationale},
    }
