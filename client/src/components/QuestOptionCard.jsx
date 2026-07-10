import { useState } from 'react';
import { buildLlmPrompt } from '../utils/llmPrompt';

/**
 * One selectable project option in the "choose your quest" step.
 *
 * Collapsed: title, pitch, and a couple of meta tags.
 * Expanded (click the header): full description, core features, stretch goals,
 * a copy-paste LLM build prompt, and the "Accept" action that forges it.
 */
const QuestOptionCard = ({ idea, index, input, onAccept, accepting, disabled }) => {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const copyPrompt = async (e) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(buildLlmPrompt({ ...idea, input }));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard blocked — nothing else to do */
        }
    };

    return (
        <div
            className="pixel-card slide-up"
            style={{ padding: '1.1rem', marginBottom: '1rem', animationDelay: `${0.05 * index}s` }}
        >
            {/* Header — click to expand */}
            <div
                onClick={() => setOpen(o => !o)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}
            >
                <div style={{
                    fontFamily: 'var(--pixel-font)', fontSize: '0.7rem',
                    color: 'var(--pixel-gold)', flexShrink: 0, marginTop: '0.15rem'
                }}>
                    {index + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="gradient-text" style={{ margin: 0, fontSize: '1rem' }}>{idea.title}</h3>
                    {idea.pitch && (
                        <p style={{ fontSize: '0.8rem', opacity: 0.85, margin: '0.35rem 0 0' }}>
                            {idea.pitch}
                        </p>
                    )}
                </div>
                <div style={{
                    fontFamily: 'var(--pixel-font)', fontSize: '0.55rem',
                    color: 'var(--pixel-dim)', flexShrink: 0, marginTop: '0.2rem'
                }}>
                    {open ? '▲ LESS' : '▼ MORE'}
                </div>
            </div>

            {/* Expanded detail */}
            {open && (
                <div style={{ marginTop: '1rem' }}>
                    {idea.description && (
                        <p style={{ fontSize: '0.85rem', opacity: 0.9, marginBottom: '0.75rem' }}>
                            {idea.description}
                        </p>
                    )}

                    {idea.core_features?.length > 0 && (
                        <>
                            <h4 style={{ margin: '0.5rem 0 0.35rem' }}>🎯 Core Loot</h4>
                            <ul className="feature-list">
                                {idea.core_features.map((f, i) => <li key={i}>{f}</li>)}
                            </ul>
                        </>
                    )}

                    {idea.stretch_goals?.length > 0 && (
                        <>
                            <h4 style={{ margin: '0.75rem 0 0.35rem' }}>🚀 Bonus Loot</h4>
                            <ul className="feature-list">
                                {idea.stretch_goals.map((g, i) => <li key={i}>{g}</li>)}
                            </ul>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                        <button
                            className="btn btn-primary"
                            disabled={disabled}
                            onClick={(e) => { e.stopPropagation(); onAccept(idea); }}
                        >
                            {accepting ? '⚔ Forging…' : '⚔ Accept This Quest'}
                        </button>
                        <button className="btn btn-secondary" onClick={copyPrompt}>
                            {copied ? '✓ Prompt Copied' : '📋 Copy Build Prompt'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuestOptionCard;
