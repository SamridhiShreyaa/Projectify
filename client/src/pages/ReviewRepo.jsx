import { useState } from 'react';
import api from '../api/axios';

const CATEGORY_LABELS = {
    architecture_clarity: { icon: '🏛️', label: 'Architecture Clarity' },
    test_coverage_signal: { icon: '🧪', label: 'Test Coverage Signal' },
    documentation_quality: { icon: '📖', label: 'Documentation Quality' },
    hiring_signal: { icon: '💼', label: 'Hiring Signal' },
};

const scoreColor = (score) => {
    if (score >= 8) return 'var(--pixel-green, #4ade80)';
    if (score >= 5) return 'var(--pixel-gold, #facc15)';
    return 'var(--pixel-red, #f87171)';
};

const ReviewRepo = () => {
    const [repoUrl, setRepoUrl] = useState('');
    const [review, setReview] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setReview(null);
        setLoading(true);
        try {
            const res = await api.post('/review', { repo_url: repoUrl });
            setReview(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to review repository.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container">
            <div className="container">
                <div className="result-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 className="gradient-text">Repo Inspector</h1>
                    <p>Paste a public GitHub repo URL to score it as a portfolio piece.</p>
                </div>

                <form onSubmit={handleSubmit} className="pixel-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            placeholder="https://github.com/owner/repo"
                            required
                            style={{ flex: '1 1 300px', padding: '0.75rem' }}
                        />
                        <button className="btn btn-primary" type="submit" disabled={loading}>
                            {loading ? '⏳ Inspecting…' : '🔍 Inspect'}
                        </button>
                    </div>
                    {error && (
                        <p style={{ color: 'var(--pixel-red, #f87171)', marginTop: '1rem' }}>{error}</p>
                    )}
                </form>

                {review && (
                    <div className="slide-up">
                        <h2 style={{ marginBottom: '0.5rem' }}>📋 {review.repo}</h2>
                        <p style={{
                            marginBottom: '1rem',
                            fontSize: '0.85rem',
                            opacity: 0.85,
                            border: '1px dashed currentColor',
                            padding: '0.4rem 0.6rem',
                            display: 'inline-block'
                        }}>
                            {review.mode === 'llm'
                                ? '🤖 Scored by LLM — a model read the file tree and README and judged each category.'
                                : '📏 Scored heuristically — rule-based counting of files and README sections, not an AI judgment.'}
                        </p>
                        {Object.entries(CATEGORY_LABELS).map(([key, { icon, label }]) => {
                            const entry = review.scores?.[key];
                            if (!entry) return null;
                            return (
                                <div key={key} className="pixel-card result-section" style={{ marginBottom: '1rem' }}>
                                    <h3>
                                        <span className="icon">{icon}</span> {label}
                                        <span style={{ float: 'right', color: scoreColor(entry.score) }}>
                                            {entry.score}/10
                                        </span>
                                    </h3>
                                    <div className="xp-bar-container" style={{ margin: '0.5rem 0' }}>
                                        <div className="xp-bar-fill" style={{ width: `${entry.score * 10}%` }}></div>
                                    </div>
                                    <p>{entry.rationale}</p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReviewRepo;
