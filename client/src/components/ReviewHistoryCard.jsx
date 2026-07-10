import { CATEGORY_LABELS, scoreColor } from '../utils/reviewLabels';

const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
};

const ReviewHistoryCard = ({ review, onReinspect, onForgeQuest }) => {
    const isTurnIn = review.kind === 'turn_in';
    const completion = review.verification?.completion;

    return (
        <div className="pixel-card fade-in" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem'
            }}>
                <h3 style={{ margin: 0 }}>{isTurnIn ? '⚑' : '📋'} {review.repo}</h3>
                <span className="project-card-date">{formatDate(review.createdAt)}</span>
            </div>

            <div style={{ margin: '0.5rem 0', fontSize: '0.75rem', opacity: 0.85 }}>
                {isTurnIn ? '⚑ Quest turn-in · ' : ''}
                {review.mode === 'llm' ? '🤖 LLM-scored' : '📏 Heuristic'}
                {review.language ? ` · ${review.language}` : ''}
            </div>

            {isTurnIn ? (
                completion && (
                    <div style={{ margin: '0.5rem 0' }}>
                        <span className="meta-tag" style={{ color: scoreColor(Math.round((completion.percent || 0) / 10)) }}>
                            ⚑ {completion.percent}% VERIFIED
                        </span>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '0.4rem' }}>
                            {completion.summary}
                        </div>
                    </div>
                )
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.5rem 0' }}>
                    {Object.entries(CATEGORY_LABELS).map(([key, { icon }]) => {
                        const entry = review.scores?.[key];
                        if (!entry) return null;
                        return (
                            <span key={key} className="meta-tag" style={{ color: scoreColor(entry.score) }}>
                                {icon} {entry.score}/10
                            </span>
                        );
                    })}
                </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                {!isTurnIn && (
                    <>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.55rem' }}
                            onClick={() => onReinspect(review.repo_url)}
                        >
                            🔁 Re-inspect
                        </button>
                        <button
                            className="btn btn-primary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.55rem' }}
                            onClick={() => onForgeQuest(review)}
                        >
                            ⚒ Forge Improvement Quest
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default ReviewHistoryCard;
