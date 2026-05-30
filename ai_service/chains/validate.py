"""
Chain 2 — Validator (Mock Mode)

In production, this would use LangChain to validate scope and difficulty.
For development, we apply simple heuristic adjustments.
"""


def validate_idea(project: dict, difficulty: str, hours: int) -> dict:
    """Validate and adjust the project scope based on difficulty and time."""

    # Adjust feature count based on available hours
    if hours < 5:
        # Very limited time — cap features
        project["core_features"] = project["core_features"][:3]
        project["description"] += " (Scoped down for limited weekly hours.)"
    elif hours < 10:
        project["core_features"] = project["core_features"][:4]
    # else keep all features

    # Add difficulty-specific notes
    if difficulty == "beginner":
        project["stretch_goals"].append("Add comprehensive code comments and documentation")
    elif difficulty == "advanced":
        project["stretch_goals"].append("Implement comprehensive test coverage (>80%)")

    return project
