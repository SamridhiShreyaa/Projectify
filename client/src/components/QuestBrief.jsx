import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import Milestone from './Milestone';
import MermaidDiagram from './MermaidDiagram';
import { buildMarkdown, slugify } from '../utils/exportMarkdown';
import { DIFFICULTY_XP } from '../utils/xp';

/**
 * Presentational renderer for a project brief.
 *
 * readOnly hides navigation actions and milestone toggling (used by the
 * public /share page); downloads stay available everywhere.
 */
const QuestBrief = ({
    project,
    readOnly = false,
    completedMilestones = [],
    onToggleMilestone,
    onShare,
    shareState, // 'idle' | 'copied'
    milestoneDates = [], // "YYYY-MM-DD" or "" per stage (owner view only)
    onSetMilestoneDate,
}) => {
    const navigate = useNavigate();
    const done = new Set(completedMilestones);

    const downloadStarterFiles = async () => {
        const zip = new JSZip();
        project.skeleton_files.forEach(({ path, content }) => {
            zip.file(path, content);
        });
        const hasReadme = project.skeleton_files.some(
            f => f.path.toLowerCase() === 'readme.md'
        );
        if (!hasReadme) {
            zip.file('README.md', buildMarkdown({ ...project, completed_milestones: [...done] }));
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slugify(project.title)}-starter.zip`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadMarkdown = () => {
        const md = buildMarkdown({ ...project, completed_milestones: [...done] });
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slugify(project.title)}-README.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const xp = DIFFICULTY_XP[project.input?.difficulty] || 50;
    const totalMilestones = project.milestones?.length || 0;
    const doneCount = [...done].filter(i => i >= 0 && i < totalMilestones).length;
    const questComplete = totalMilestones > 0 && doneCount === totalMilestones;
    const canToggle = !readOnly && typeof onToggleMilestone === 'function';

    return (
        <div className="result-container">
            {/* Quest Banner */}
            <div className="slide-up" style={{
                textAlign: 'center',
                marginBottom: '2rem',
                padding: '1.5rem',
                border: '3px solid var(--pixel-gold)',
                background: 'rgba(255,215,0,0.05)',
                boxShadow: 'var(--pixel-shadow), var(--pixel-shadow-gold)'
            }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏆</div>
                <div style={{
                    fontFamily: 'var(--pixel-font)',
                    fontSize: '0.9rem',
                    color: 'var(--pixel-gold)',
                    textShadow: 'var(--pixel-shadow-gold)',
                    marginBottom: '0.5rem'
                }}>
                    {questComplete ? '⚑ QUEST COMPLETE!' : readOnly ? 'SHARED QUEST SCROLL' : 'QUEST GENERATED!'}
                </div>
                <div className="xp-bar-container" style={{ maxWidth: '300px', margin: '0.75rem auto 0.5rem' }}>
                    <div className="xp-bar-fill" style={{ width: `${xp}%` }}></div>
                </div>
                <div style={{
                    fontFamily: 'var(--pixel-font)',
                    fontSize: '0.4rem',
                    color: 'var(--pixel-green)'
                }}>
                    +{xp} XP EARNED
                </div>
            </div>

            <div className="result-header slide-up" style={{ animationDelay: '0.05s' }}>
                <h1 className="gradient-text">{project.title}</h1>
                <p>{project.description}</p>

                {project.input && (
                    <div className="result-meta">
                        <span className="meta-tag">📂 {project.input.topic}</span>
                        <span className="meta-tag">📊 {project.input.difficulty}</span>
                        <span className="meta-tag">🛡️ {project.input.stack}</span>
                        <span className="meta-tag">⏱️ {project.input.hours_per_week}h/week</span>
                        {project.source_repo && (
                            <span className="meta-tag" style={{ color: 'var(--pixel-gold)' }}>
                                ⚒ forged from {project.source_repo}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {project.core_features?.length > 0 && (
                <div className="pixel-card result-section slide-up" style={{ animationDelay: '0.1s' }}>
                    <h3><span className="icon">🎯</span> Core Loot</h3>
                    <ul className="feature-list">
                        {project.core_features.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                </div>
            )}

            {project.stretch_goals?.length > 0 && (
                <div className="pixel-card result-section slide-up" style={{ animationDelay: '0.15s' }}>
                    <h3><span className="icon">🚀</span> Bonus Loot</h3>
                    <ul className="feature-list">
                        {project.stretch_goals.map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                </div>
            )}

            {project.scope_notes && (
                <div className="pixel-card result-section slide-up" style={{ animationDelay: '0.17s' }}>
                    <h3><span className="icon">📜</span> Quest Master's Notes</h3>
                    <p style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '0.5rem' }}>
                        {project.scope_notes}
                    </p>
                </div>
            )}

            {totalMilestones > 0 && (
                <div className="pixel-card result-section slide-up" style={{ animationDelay: '0.2s' }}>
                    <h3>
                        <span className="icon">📅</span> Quest Stages
                        {questComplete && (
                            <span style={{ float: 'right', color: 'var(--pixel-gold)' }}>⚑ COMPLETE</span>
                        )}
                    </h3>
                    <div style={{
                        fontFamily: 'var(--pixel-font)',
                        fontSize: '0.45rem',
                        color: 'var(--pixel-dim)',
                        margin: '0.5rem 0 0.25rem',
                        letterSpacing: '0.1em'
                    }}>
                        QUEST PROGRESS: {doneCount}/{totalMilestones} STAGES CLEARED
                    </div>
                    <div className="xp-bar-container" style={{ margin: '0.25rem 0 1rem' }}>
                        <div className="xp-bar-fill" style={{
                            width: `${totalMilestones ? (doneCount / totalMilestones) * 100 : 0}%`
                        }}></div>
                    </div>
                    {project.milestones.map((m, i) => (
                        <Milestone
                            key={i}
                            milestone={m}
                            index={i}
                            completed={done.has(i)}
                            onToggle={canToggle ? onToggleMilestone : undefined}
                            readOnly={!canToggle}
                            dueDate={milestoneDates[i] || ''}
                            onSetDate={!readOnly ? onSetMilestoneDate : undefined}
                        />
                    ))}
                </div>
            )}

            {project.mermaid_diagram && (
                <div className="pixel-card result-section slide-up" style={{ animationDelay: '0.22s' }}>
                    <h3><span className="icon">🗺️</span> Architecture Map</h3>
                    <MermaidDiagram chart={project.mermaid_diagram} />
                </div>
            )}

            {project.file_structure && (
                <div className="pixel-card result-section slide-up" style={{ animationDelay: '0.25s' }}>
                    <h3><span className="icon">📁</span> Dungeon Map</h3>
                    <div className="file-structure-block">{project.file_structure}</div>
                </div>
            )}

            {project.learning_outcomes?.length > 0 && (
                <div className="pixel-card result-section slide-up" style={{ animationDelay: '0.3s' }}>
                    <h3><span className="icon">📚</span> Skills Unlocked</h3>
                    <ul className="feature-list">
                        {project.learning_outcomes.map((o, i) => <li key={i}>{o}</li>)}
                    </ul>
                </div>
            )}

            {project.resources?.length > 0 && (
                <div className="pixel-card result-section slide-up" style={{ animationDelay: '0.35s' }}>
                    <h3><span className="icon">🔗</span> Spell Scrolls</h3>
                    <ul className="feature-list">
                        {project.resources.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                </div>
            )}

            <div className="result-actions slide-up" style={{ animationDelay: '0.4s' }}>
                {project.skeleton_files?.length > 0 && (
                    <button className="btn btn-primary" onClick={downloadStarterFiles}>
                        📦 Download Starter Files
                    </button>
                )}
                <button className="btn btn-secondary" onClick={downloadMarkdown}>
                    📜 Export Scroll (.md)
                </button>
                {!readOnly && onShare && (
                    <button className="btn btn-secondary" onClick={onShare}>
                        {shareState === 'copied' ? '✓ LINK COPIED' : '🔗 Share Quest'}
                    </button>
                )}
                {!readOnly && (
                    <>
                        <button className="btn btn-primary" onClick={() => navigate('/')}>
                            ⚔ New Quest
                        </button>
                        <button className="btn btn-secondary" onClick={() => navigate('/saved')}>
                            📜 Quest Log
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default QuestBrief;
