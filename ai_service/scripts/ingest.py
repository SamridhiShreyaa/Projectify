"""
One-off ingestion script — embed the seed dataset into Chroma.

Usage (from ai_service/):
    python scripts/ingest.py

Respects CHROMA_DIR (defaults to ai_service/.chroma). Safe to re-run:
entries are upserted by id.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from retrieval import ingest_patterns, DEFAULT_DATA_PATH, _default_persist_dir


def main():
    count = ingest_patterns()
    print(f"Ingested {count} project patterns")
    print(f"  from: {DEFAULT_DATA_PATH}")
    print(f"  into: {_default_persist_dir()}")


if __name__ == "__main__":
    main()
