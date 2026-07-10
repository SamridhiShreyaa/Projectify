/**
 * TurnInReport — renders a project's latest turn-in verification snapshot
 * (project.turn_in): completion bar, per-feature and per-milestone verdicts
 * with evidence, and the stack match. Kept separate from QuestBrief so the
 * public share page never exposes turn-in data.
 */

const VERDICT_BANNERS = {
    complete: { icon: '🏆', label: 'QUEST COMPLETE', color: 'var(--pixel-gold)' },
    substantial: { icon: '⚔', label: 'SUBSTANTIALLY BUILT', color: 'var(--pixel-green)' },
    partial: { icon: '🛠', label: 'PARTIALLY BUILT', color: 'var(--pixel-cyan)' },
    not_started: { icon: '🕳', label: 'LITTLE EVIDENCE YET', color: 'var(--pixel-red)' },
};

const ITEM_ICONS = {
    evident: '✅', done: '✅',
    partial: '🟡',
    not_found: '❌', not_started: '❌',
};

const STACK_ICONS = { match: '✅', partial: '🟡', mismatch: '❌' };

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
};

const VerdictRow = ({ text, verdict, evidence }) => (
    <li style={{ marginBottom: '0.6rem', listStyle: 'none' }}>
        <div>
            <span style={{ marginRight: '0.5rem' }}>{ITEM_ICONS[verdict] || '🟡'}</span>
            {text}
        </div>
        {evidence && (
            <div style={{
                fontSize: '0.65rem', opacity: 0.7,
                margin: '0.2rem 0 0 1.6rem', wordBreak: 'break-word'
            }}>
                {evidence}
            </div>
        )}
    </li>
);

const ProgressHistory = ({ history }) => {
    if (!history || history.length < 2) return null;
    const max = 100;
    return (
        <div style={{ marginTop: '1.25rem' }}>
            <h3>📈 Verification History</h3>
            <div style={{
                display: 'flex', alignItems: 'flex-end', gap: '0.5rem',
                height: '70px', marginTop: '0.75rem', padding: '0 0.25rem'
            }}>
                {history.map((h, i) => (
                    <div key={h._id || i} title={`${h.percent}% on ${formatDate(h.createdAt)}`} style={{
                        flex: '1 1 0', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'flex-end', height: '100%'
                    }}>
                        <div style={{
                            width: '100%', maxWidth: '28px',
                            height: `${Math.max(4, (h.percent / max) * 100)}%`,
                            background: i === history.length - 1 ? 'var(--pixel-gold)' : 'var(--pixel-cyan)',
                            border: '2px solid var(--pixel-border)'
                        }}></div>
                        <span style={{ fontSize: '0.55rem', marginTop: '0.25rem', opacity: 0.75 }}>
                            {h.percent}%
                        </span>
                    </div>
                ))}
            </div>
            <div style={{ fontSize: '0.6rem', opacity: 0.6, marginTop: '0.5rem' }}>
                {history.length} turn-in attempts, oldest to newest.
            </div>
        </div>
    );
};

const TurnInReport = ({ turnIn, repoUrl, history }) => {
    if (!turnIn) return null;

    const banner = VERDICT_BANNERS[turnIn.verdict] || VERDICT_BANNERS.partial;

    return (
        <div className="pixel-card fade-in" style={{ marginTop: '1.5rem', padding: '1.25rem' }}>
            <div style={{ textAlign: 'center' }}>
                <h2 style={{ margin: 0, color: banner.color }}>
                    {banner.icon} {banner.label}
                </h2>
                <div style={{ fontSize: '0.75rem', opacity: 0.85, margin: '0.4rem 0' }}>
                    Guild inspection of{' '}
                    <a href={repoUrl} target="_blank" rel="noreferrer">{repoUrl}</a>
                    {turnIn.verified_at ? ` · ${formatDate(turnIn.verified_at)}` : ''}
                </div>
                <div className="xp-bar-container" style={{ maxWidth: '360px', margin: '0.75rem auto 0.25rem' }}>
                    <div className="xp-bar-fill" style={{ width: `${turnIn.percent || 0}%` }}></div>
                </div>
                <div style={{ fontSize: '0.8rem' }}>
                    {turnIn.percent}% verified · {turnIn.summary}
                </div>
            </div>

            <ProgressHistory history={history} />

            {turnIn.features?.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                    <h3>⚙ Core Features</h3>
                    <ul style={{ padding: 0, margin: '0.5rem 0 0' }}>
                        {turnIn.features.map((f, i) => (
                            <VerdictRow key={i} text={f.feature} verdict={f.verdict} evidence={f.evidence} />
                        ))}
                    </ul>
                </div>
            )}

            {turnIn.milestones?.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h3>🗺 Quest Stages</h3>
                    <ul style={{ padding: 0, margin: '0.5rem 0 0' }}>
                        {turnIn.milestones.map((m, i) => (
                            <VerdictRow key={i} text={m.milestone} verdict={m.verdict} evidence={m.evidence} />
                        ))}
                    </ul>
                </div>
            )}

            {turnIn.stack_match && (
                <div style={{ marginTop: '1rem' }}>
                    <h3>🛡 Weapon Check</h3>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                        {STACK_ICONS[turnIn.stack_match.verdict] || '🟡'} {turnIn.stack_match.rationale}
                    </div>
                </div>
            )}

            <div style={{ fontSize: '0.6rem', opacity: 0.6, marginTop: '1.25rem' }}>
                {turnIn.mode === 'llm'
                    ? '🤖 Judged by the guild inspector (LLM) from the repo\'s file tree and README.'
                    : '📏 Judged by rule-based matching against the repo\'s file tree and README.'}
                {' '}Verdicts are a signal, not a grade — only public file names and the README are examined.
            </div>
        </div>
    );
};

export default TurnInReport;
