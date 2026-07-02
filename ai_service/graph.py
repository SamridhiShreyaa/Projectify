"""
LangGraph pipeline — formalizes the idea → validate → expand chain sequence
into an explicit state graph with named nodes:

    planner → requirements → architecture → generator → reviewer

Node responsibilities:
- planner:      Chain 1 (chains/idea.py) — generate the raw project idea
- requirements: Chain 2 (chains/validate.py) — validate and adjust scope
- architecture: prepare expansion inputs (normalized stack, scope notes)
- generator:    Chain 3 (chains/expand.py) — full brief, skeletons, diagram
- reviewer:     completeness check on the final brief (non-fatal)

This is a control-flow refactor of the previous direct calls in main.py:
the three chains run in the same order with the same arguments, so
input/output behavior (including mock mode) is unchanged.
"""
from typing import Annotated, List, TypedDict
from operator import add

from langgraph.graph import StateGraph, START, END

from chains.idea import generate_idea
from chains.validate import validate_idea
from chains.expand import expand_project

REQUIRED_OUTPUT_KEYS = (
    "title", "description", "core_features", "stretch_goals",
    "milestones", "file_structure", "learning_outcomes", "resources",
)


class PipelineState(TypedDict, total=False):
    # Request inputs
    topic: str
    difficulty: str
    stack: str
    hours_per_week: int
    # Working data
    project: dict
    review_notes: List[str]
    # Execution trace — appended to by every node, in order
    node_trace: Annotated[List[str], add]


def planner(state: PipelineState) -> PipelineState:
    raw_idea = generate_idea(
        topic=state["topic"],
        difficulty=state["difficulty"],
        stack=state["stack"],
        hours=state["hours_per_week"],
    )
    return {"project": raw_idea, "node_trace": ["planner"]}


def requirements(state: PipelineState) -> PipelineState:
    validated = validate_idea(
        project=state["project"],
        difficulty=state["difficulty"],
        hours=state["hours_per_week"],
    )
    return {"project": validated, "node_trace": ["requirements"]}


def architecture(state: PipelineState) -> PipelineState:
    # Normalize the inputs Chain 3 depends on so the generator node
    # receives the same arguments main.py used to pass directly.
    project = dict(state["project"])
    project.setdefault("scope_notes", "")
    return {
        "project": project,
        "stack": state["stack"].strip(),
        "node_trace": ["architecture"],
    }


def generator(state: PipelineState) -> PipelineState:
    expanded = expand_project(
        project=state["project"],
        stack=state["stack"],
    )
    return {"project": expanded, "node_trace": ["generator"]}


def reviewer(state: PipelineState) -> PipelineState:
    # Non-fatal completeness check — response_model validation in main.py
    # remains the authoritative gate, so missing keys are recorded, not raised.
    project = state["project"]
    notes = [f"missing field: {k}" for k in REQUIRED_OUTPUT_KEYS if k not in project]
    return {"review_notes": notes, "node_trace": ["reviewer"]}


def build_graph():
    builder = StateGraph(PipelineState)
    builder.add_node("planner", planner)
    builder.add_node("requirements", requirements)
    builder.add_node("architecture", architecture)
    builder.add_node("generator", generator)
    builder.add_node("reviewer", reviewer)

    builder.add_edge(START, "planner")
    builder.add_edge("planner", "requirements")
    builder.add_edge("requirements", "architecture")
    builder.add_edge("architecture", "generator")
    builder.add_edge("generator", "reviewer")
    builder.add_edge("reviewer", END)
    return builder.compile()


_pipeline = None


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        _pipeline = build_graph()
    return _pipeline


def run_pipeline(topic: str, difficulty: str, stack: str, hours_per_week: int) -> dict:
    """Run the full pipeline; returns the final graph state."""
    return get_pipeline().invoke({
        "topic": topic,
        "difficulty": difficulty,
        "stack": stack,
        "hours_per_week": hours_per_week,
    })
