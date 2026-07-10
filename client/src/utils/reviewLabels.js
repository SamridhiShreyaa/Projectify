// Shared between the Repo Inspector page and review history cards.

export const CATEGORY_LABELS = {
    architecture_clarity: { icon: '🏛️', label: 'Architecture Clarity' },
    test_coverage_signal: { icon: '🧪', label: 'Test Coverage Signal' },
    documentation_quality: { icon: '📖', label: 'Documentation Quality' },
    hiring_signal: { icon: '💼', label: 'Hiring Signal' },
};

export const scoreColor = (score) => {
    if (score >= 8) return 'var(--pixel-green, #4ade80)';
    if (score >= 5) return 'var(--pixel-gold, #facc15)';
    return 'var(--pixel-red, #f87171)';
};

// Crafts the prefill payload for a "Forge Improvement Quest" from a review:
// targets the two weakest-scoring categories. The stack is auto-detected from
// the repo (detected_stack, falling back to the primary language) so the user
// never has to pick a language by hand.
export function improvementPrefill(review) {
    const weakest = Object.entries(review.scores || {})
        .filter(([k]) => CATEGORY_LABELS[k])
        .sort((a, b) => a[1].score - b[1].score)
        .slice(0, 2)
        .map(([k]) => CATEGORY_LABELS[k].label.toLowerCase());
    const topic = `Improve the "${review.repo}" repository: strengthen ${weakest.join(' and ')}`.slice(0, 200);
    const stack = (review.detected_stack || review.language || '').slice(0, 200);
    return {
        topic,
        stack,
        source_review_id: review._id,
        source_repo: review.repo,
    };
}
