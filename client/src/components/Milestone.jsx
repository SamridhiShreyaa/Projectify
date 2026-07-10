const Milestone = ({ milestone, index, completed, onToggle, readOnly, dueDate, onSetDate }) => {
    // Parse milestone text — usually formatted like "Week N: description"
    const parts = milestone.split(':');
    const title = parts[0]?.trim() || `Stage ${index + 1}`;
    const description = parts.slice(1).join(':').trim() || milestone;

    const interactive = !readOnly && typeof onToggle === 'function';
    const canSetDate = !readOnly && typeof onSetDate === 'function';
    const today = new Date().toISOString().slice(0, 10);
    const overdue = !!dueDate && !completed && dueDate < today;

    return (
        <div className="milestone fade-in" style={{
            animationDelay: `${index * 0.08}s`,
            opacity: completed ? 0.6 : 1
        }}>
            {interactive && (
                <button
                    type="button"
                    onClick={() => onToggle(index)}
                    aria-label={completed ? `Mark stage ${index + 1} incomplete` : `Mark stage ${index + 1} complete`}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '1.1rem',
                        color: completed ? 'var(--pixel-green)' : 'var(--pixel-dim)',
                        padding: '0 0.4rem 0 0',
                        lineHeight: 1
                    }}
                >
                    {completed ? '☑' : '☐'}
                </button>
            )}
            <div className="milestone-number">
                {index + 1}
            </div>
            <div className="milestone-content">
                <div className="milestone-title" style={{
                    textDecoration: completed ? 'line-through' : 'none'
                }}>
                    📍 {title}
                    {dueDate && (
                        <span style={{
                            marginLeft: '0.6rem',
                            fontSize: '0.65rem',
                            color: overdue ? 'var(--pixel-red)' : 'var(--pixel-dim)'
                        }}>
                            🕰 due {dueDate}{overdue ? ' — OVERDUE' : ''}
                        </span>
                    )}
                </div>
                <div className="milestone-desc">{description}</div>
                {canSetDate && (
                    <input
                        type="date"
                        value={dueDate || ''}
                        onChange={(e) => onSetDate(index, e.target.value)}
                        aria-label={`Target date for stage ${index + 1}`}
                        style={{
                            marginTop: '0.35rem',
                            background: 'var(--pixel-dark)',
                            color: 'var(--pixel-white)',
                            border: '2px solid var(--pixel-border)',
                            fontFamily: 'var(--pixel-body)',
                            fontSize: '0.7rem',
                            padding: '0.15rem 0.35rem'
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default Milestone;
