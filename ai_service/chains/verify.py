"""
Chain 5 — Quest turn-in verifier

Given a GitHub repo and the original project brief ("quest"), judges how much
of the brief was actually built: a verdict per core feature and milestone,
a stack match, and a deterministic completion percentage.

Reuses the cached GitHub fetching from chains/review.py. Falls back to a
token-matching heuristic when no LLM API key is configured, and substitutes
heuristic verdicts per-item whenever the LLM omits or mangles an entry —
the brief's own feature list is always the authoritative count and order.
"""
import os
import re

from chains.review import fetch_repo_data

FEATURE_VERDICTS = ("evident", "partial", "not_found")
MILESTONE_VERDICTS = ("done", "partial", "not_started")
STACK_VERDICTS = ("match", "partial", "mismatch")

MAX_ITEMS = 8  # cap features/milestones sent to (and judged by) the verifier

NO_EVIDENCE = "(no verifiable evidence cited)"

_STOPWORDS = {
    "the", "a", "an", "and", "or", "with", "for", "to", "of", "in", "on", "by",
    "user", "users", "implement", "implementing", "add", "adding", "build",
    "building", "create", "creating", "support", "using", "via", "week",
    "basic", "simple", "setup", "set", "up", "project", "app", "application",
    "feature", "features", "functionality", "system", "data", "page", "pages",
}


# ---------- Heuristic verifier (mock mode / per-item fallback) ----------
def _tokenize(text: str) -> list:
    tokens = re.findall(r"[a-z0-9]+", (text or "").lower())
    seen = []
    for t in tokens:
        if len(t) >= 3 and t not in _STOPWORDS and t not in seen:
            seen.append(t)
    return seen


def _match_evidence(text: str, tree: list, readme_lower: str) -> tuple:
    """Return (hit_count, evidence_string) for a feature/milestone description."""
    tokens = _tokenize(text)
    if not tokens:
        return 0, ""

    path_hits = []
    readme_hits = []
    lower_tree = [p.lower() for p in tree]
    for token in tokens:
        for path, lower_path in zip(tree, lower_tree):
            if token in lower_path:
                path_hits.append((token, path))
                break
        else:
            if token in readme_lower:
                readme_hits.append(token)

    hits = len(path_hits) + len(readme_hits)
    parts = []
    if path_hits:
        parts.append("files: " + ", ".join(p for _, p in path_hits[:3]))
    if readme_hits:
        parts.append("README mentions: " + ", ".join(readme_hits[:3]))
    return hits, "; ".join(parts)


def _heuristic_item(text: str, tree: list, readme_lower: str, verdicts: tuple) -> dict:
    hits, evidence = _match_evidence(text, tree, readme_lower)
    if hits >= 2:
        verdict = verdicts[0]
    elif hits == 1:
        verdict = verdicts[1]
    else:
        verdict, evidence = verdicts[2], ""
    return {"verdict": verdict, "evidence": evidence}


_STACK_MARKERS = [
    ("package.json", "node"),
    (".jsx", "react"),
    (".tsx", "react"),
    (".vue", "vue"),
    ("next.config", "next"),
    ("svelte.config", "svelte"),
    ("requirements.txt", "python"),
    ("pyproject.toml", "python"),
    ("manage.py", "django"),
    ("go.mod", "go"),
    ("cargo.toml", "rust"),
    ("pom.xml", "java"),
    ("build.gradle", "java"),
    ("gemfile", "ruby"),
    ("composer.json", "php"),
]

# Map brief-stack vocabulary onto the marker/language vocabulary above
_TECH_ALIASES = {
    "nodejs": "node", "express": "node", "nestjs": "node", "javascript": "node",
    "typescript": "node", "reactjs": "react", "nextjs": "next",
    "fastapi": "python", "flask": "python", "django": "django",
    "golang": "go", "rustlang": "rust", "springboot": "java", "spring": "java",
    "rails": "ruby", "laravel": "php", "sveltekit": "svelte",
}


def _detected_techs(repo_data: dict) -> set:
    lower_tree = [p.lower() for p in repo_data.get("tree", [])]
    detected = set()
    for marker, tech in _STACK_MARKERS:
        if any(marker in p for p in lower_tree):
            detected.add(tech)
    language = (repo_data.get("language") or "").lower()
    if language:
        detected.add(_TECH_ALIASES.get(language, language))
    return detected


def _heuristic_stack_match(repo_data: dict, stack: str) -> dict:
    detected = _detected_techs(repo_data)
    brief_techs = set()
    for token in _tokenize(stack):
        brief_techs.add(_TECH_ALIASES.get(token, token))
    # Only compare techs we could plausibly detect from markers/language
    known = brief_techs & ({t for _, t in _STACK_MARKERS} | set(_TECH_ALIASES.values()))

    detected_label = ", ".join(sorted(detected)) if detected else "nothing recognizable"
    if not known:
        return {
            "verdict": "partial",
            "rationale": f"Could not map the quest stack to known markers; repo shows {detected_label}.",
        }
    matched = known & detected
    if matched == known:
        verdict = "match"
    elif matched:
        verdict = "partial"
    else:
        verdict = "mismatch"
    return {
        "verdict": verdict,
        "rationale": f"Quest stack needs {', '.join(sorted(known))}; repo shows {detected_label}.",
    }


def _heuristic_verify(repo_data: dict, brief: dict) -> dict:
    tree = repo_data["tree"]
    readme_lower = repo_data["readme"].lower()
    return {
        "features": [
            {"feature": f, **_heuristic_item(f, tree, readme_lower, FEATURE_VERDICTS)}
            for f in brief["core_features"]
        ],
        "milestones": [
            {"milestone": m, **_heuristic_item(m, tree, readme_lower, MILESTONE_VERDICTS)}
            for m in brief["milestones"]
        ],
        "stack_match": _heuristic_stack_match(repo_data, brief.get("stack", "")),
    }


# ---------- Deterministic completion (never taken from the LLM) ----------
_FEATURE_CREDIT = {"evident": 1.0, "partial": 0.5, "not_found": 0.0}
_MILESTONE_CREDIT = {"done": 1.0, "partial": 0.5, "not_started": 0.0}


def compute_completion(features: list, milestones: list) -> dict:
    feature_score = (
        sum(_FEATURE_CREDIT[f["verdict"]] for f in features) / len(features)
        if features else 0.0
    )
    if milestones:
        milestone_score = sum(_MILESTONE_CREDIT[m["verdict"]] for m in milestones) / len(milestones)
        ratio = 0.7 * feature_score + 0.3 * milestone_score
    else:
        ratio = feature_score

    percent = round(ratio * 100)
    if percent >= 90:
        verdict = "complete"
    elif percent >= 60:
        verdict = "substantial"
    elif percent >= 25:
        verdict = "partial"
    else:
        verdict = "not_started"

    evident = sum(1 for f in features if f["verdict"] == "evident")
    partial = sum(1 for f in features if f["verdict"] == "partial")
    summary = f"{evident}/{len(features)} core features evident, {partial} partial"
    if milestones:
        done = sum(1 for m in milestones if m["verdict"] == "done")
        summary += f"; {done}/{len(milestones)} milestones done"
    return {"percent": percent, "verdict": verdict, "summary": summary + "."}


# ---------- Evidence sanitizer ----------
_PATH_LIKE = re.compile(r"[\w-]+(?:/[\w.-]+)+|[\w-]+\.[A-Za-z]{1,10}\b")


def sanitize_evidence(entry: dict, tree: list, downgrade_to: str) -> dict:
    """If evidence cites a path that isn't in the repo tree, drop the evidence
    and downgrade the top verdict — counters LLM path hallucination."""
    evidence = str(entry.get("evidence") or "")
    candidates = _PATH_LIKE.findall(evidence)
    if not candidates:
        return entry
    lower_tree = [p.lower() for p in tree]
    for candidate in candidates:
        c = candidate.lower().lstrip("./")
        if not any(c in p for p in lower_tree):
            sanitized = dict(entry)
            sanitized["evidence"] = NO_EVIDENCE
            if sanitized["verdict"] in (FEATURE_VERDICTS[0], MILESTONE_VERDICTS[0]):
                sanitized["verdict"] = downgrade_to
            return sanitized
    return entry


# ---------- LLM verifier ----------
_VERIFY_PROMPT = None


def _get_prompt():
    global _VERIFY_PROMPT
    if _VERIFY_PROMPT is None:
        from langchain_core.prompts import ChatPromptTemplate
        _VERIFY_PROMPT = ChatPromptTemplate.from_messages([
            ("system", """You are a strict but fair guild inspector verifying whether a developer
actually built what a project brief asked for, using only the repository's
file tree and README as evidence.
Respond ONLY with valid JSON — no markdown fences, no explanation.
Schema:
{{
  "features": [
    {{"index": 1, "verdict": "evident|partial|not_found", "evidence": "string"}}, ...
  ],
  "milestones": [
    {{"index": 1, "verdict": "done|partial|not_started", "evidence": "string"}}, ...
  ],
  "stack_match": {{"verdict": "match|partial|mismatch", "rationale": "string"}}
}}
Rules:
- Return one entry per numbered feature and milestone, using the given index.
- "evident"/"done" ONLY when the file tree or README concretely supports it.
- evidence MUST cite file paths that appear in the provided tree, or quote the
  README. Never invent paths. If unsure, use "partial" with what you did see.
- Keep each evidence string under 200 characters."""),
            ("human", """The quest brief:

Title: {title}
Target stack: {stack}

Core features:
{features}

Milestones:
{milestones}

The repository turned in as proof of work:

Repo: {full_name}
Primary language: {language}

File tree ({file_count} files):
{tree}

README:
{readme}

Judge each numbered feature and milestone against the repository."""),
        ])
    return _VERIFY_PROMPT


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
        temperature=0.2,
        max_tokens=1500,
    )


def _numbered(items: list) -> str:
    return "\n".join(f"{i + 1}. {item}" for i, item in enumerate(items)) or "(none)"


def _index_llm_entries(raw, count: int) -> dict:
    """Map LLM entries to 0-based brief positions; tolerate missing/garbage."""
    indexed = {}
    if not isinstance(raw, list):
        return indexed
    for pos, entry in enumerate(raw):
        if not isinstance(entry, dict):
            continue
        idx = entry.get("index")
        i = idx - 1 if isinstance(idx, int) and 1 <= idx <= count else pos
        if 0 <= i < count and i not in indexed:
            indexed[i] = entry
    return indexed


def _merge_items(brief_items: list, llm_raw, heuristic_items: list,
                 key: str, verdicts: tuple, tree: list) -> list:
    """Per-item merge: valid LLM verdicts (evidence-sanitized) win, everything
    else falls back to the heuristic verdict for that same item."""
    llm_entries = _index_llm_entries(llm_raw, len(brief_items))
    merged = []
    for i, text in enumerate(brief_items):
        entry = llm_entries.get(i)
        verdict = entry.get("verdict") if isinstance(entry, dict) else None
        if verdict in verdicts:
            item = {key: text, "verdict": verdict, "evidence": str(entry.get("evidence") or "")}
            merged.append(sanitize_evidence(item, tree, downgrade_to=verdicts[1]))
        else:
            merged.append(heuristic_items[i])
    return merged


def verify_quest(repo_url: str, brief: dict) -> dict:
    """Verify a repo against its quest brief. LLM if available, else heuristic."""
    repo_data = fetch_repo_data(repo_url)

    brief = dict(brief)
    brief["core_features"] = list(brief.get("core_features") or [])[:MAX_ITEMS]
    brief["milestones"] = list(brief.get("milestones") or [])[:MAX_ITEMS]

    heuristic = _heuristic_verify(repo_data, brief)
    mode = "heuristic"
    features = heuristic["features"]
    milestones = heuristic["milestones"]
    stack_match = heuristic["stack_match"]

    llm = _get_llm()
    if llm:
        try:
            from langchain_core.output_parsers import JsonOutputParser
            parser = JsonOutputParser()
            chain = _get_prompt() | llm | parser
            result = chain.invoke({
                "title": brief.get("title", ""),
                "stack": brief.get("stack", ""),
                "features": _numbered(brief["core_features"]),
                "milestones": _numbered(brief["milestones"]),
                "full_name": repo_data["full_name"],
                "language": repo_data["language"],
                "file_count": len(repo_data["tree"]),
                "tree": "\n".join(repo_data["tree"][:300]),
                "readme": repo_data["readme"][:6000],
            })
            if isinstance(result, dict):
                mode = "llm"
                tree = repo_data["tree"]
                features = _merge_items(
                    brief["core_features"], result.get("features"),
                    heuristic["features"], "feature", FEATURE_VERDICTS, tree)
                milestones = _merge_items(
                    brief["milestones"], result.get("milestones"),
                    heuristic["milestones"], "milestone", MILESTONE_VERDICTS, tree)
                sm = result.get("stack_match")
                if isinstance(sm, dict) and sm.get("verdict") in STACK_VERDICTS:
                    stack_match = {
                        "verdict": sm["verdict"],
                        "rationale": str(sm.get("rationale") or ""),
                    }
        except Exception as e:
            print(f"[WARN] LLM verification failed, falling back to heuristics: {e}")

    return {
        "repo": repo_data["full_name"],
        "mode": mode,
        "language": repo_data["language"],
        "features": features,
        "milestones": milestones,
        "stack_match": stack_match,
        "completion": compute_completion(features, milestones),
    }
