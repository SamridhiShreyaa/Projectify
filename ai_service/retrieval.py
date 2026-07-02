"""
RAG grounding — retrieval over a seed corpus of real project patterns.

Design notes:
- Embeddings are deterministic feature-hashed bag-of-words vectors computed
  in-process (no model downloads), so ingestion and retrieval work offline
  and in CI. Chroma is only used as the vector store: we always pass
  explicit embeddings, so its default (downloadable) embedding model is
  never invoked.
- Everything degrades gracefully: if chromadb isn't installed, the store
  is empty, or anything raises, retrieve_patterns() returns [] and
  generation proceeds ungrounded.
"""
import hashlib
import json
import math
import os
import re

COLLECTION_NAME = "project_patterns"
EMBED_DIM = 512
DEFAULT_DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "project_patterns.json")


def _default_persist_dir() -> str:
    return os.getenv("CHROMA_DIR", os.path.join(os.path.dirname(__file__), ".chroma"))


# ---------- Deterministic embedding ----------
def _tokenize(text: str):
    return re.findall(r"[a-z0-9+#]+", text.lower())


def embed_text(text: str):
    """Feature-hashed, L2-normalized bag-of-words vector."""
    vec = [0.0] * EMBED_DIM
    for token in _tokenize(text):
        digest = hashlib.md5(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "little") % EMBED_DIM
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vec[index] += sign
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


# ---------- Store access ----------
def _get_collection(persist_dir=None, create=False):
    import chromadb
    client = chromadb.PersistentClient(path=persist_dir or _default_persist_dir())
    if create:
        return client.get_or_create_collection(
            COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
        )
    return client.get_collection(COLLECTION_NAME)


def _entry_document(entry: dict) -> str:
    return " ".join([
        entry.get("title", ""),
        entry.get("domain", ""),
        entry.get("stack", ""),
        entry.get("difficulty", ""),
        entry.get("description", ""),
        " ".join(entry.get("patterns", [])),
    ])


def ingest_patterns(data_path=None, persist_dir=None) -> int:
    """Load the seed dataset into Chroma. Returns the number of entries."""
    path = data_path or DEFAULT_DATA_PATH
    with open(path, encoding="utf-8") as f:
        entries = json.load(f)

    collection = _get_collection(persist_dir, create=True)
    collection.upsert(
        ids=[e["id"] for e in entries],
        documents=[_entry_document(e) for e in entries],
        embeddings=[embed_text(_entry_document(e)) for e in entries],
        metadatas=[{
            "title": e.get("title", ""),
            "domain": e.get("domain", ""),
            "difficulty": e.get("difficulty", ""),
            "stack": e.get("stack", ""),
            "description": e.get("description", ""),
        } for e in entries],
    )
    return len(entries)


def retrieve_patterns(topic: str, stack: str, difficulty: str, k: int = 3):
    """Top-k seed patterns for the request, or [] if the store is unavailable."""
    try:
        collection = _get_collection()
        count = collection.count()
        if count == 0:
            return []
        query = f"{topic} {stack} {difficulty}"
        results = collection.query(
            query_embeddings=[embed_text(query)],
            n_results=min(k, count),
        )
        return list(results["metadatas"][0])
    except Exception:
        # Missing chromadb, empty/absent store, or query failure —
        # grounding is best-effort, never fatal.
        return []


def format_grounding(patterns) -> str:
    """Render retrieved patterns as prompt context (empty string if none)."""
    if not patterns:
        return ""
    lines = [
        f"- {p.get('title')} ({p.get('domain')}, {p.get('difficulty')}, {p.get('stack')}): "
        f"{p.get('description')}"
        for p in patterns
    ]
    return (
        "For grounding, here are real project patterns similar to this request "
        "(use them to calibrate scope and realism — do not copy them verbatim):\n"
        + "\n".join(lines)
    )
