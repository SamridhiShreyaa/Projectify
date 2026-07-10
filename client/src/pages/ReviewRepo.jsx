import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import ReviewHistoryCard from '../components/ReviewHistoryCard';
import { CATEGORY_LABELS, scoreColor, improvementPrefill } from '../utils/reviewLabels';

const ReviewRepo = () => {
    const [repoUrl, setRepoUrl] = useState('');
    const [review, setReview] = useState(null);
    const [history, setHistory] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        let cancelled = false;
        api.get('/review')
            .then(res => { if (!cancelled) setHistory(res.data); })
            .catch(() => { /* ledger is best-effort; inspection still works */ });
        return () => { cancelled = true; };
    }, []);

    const runInspection = async (url) => {
        setError('');
        setReview(null);
        setLoading(true);
        try {
            const res = await api.post('/review', { repo_url: url });
            setReview(res.data);
            setHistory(prev => [res.data, ...prev]);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to review repository.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        runInspection(repoUrl);
    };

    const handleReinspect = (url) => {
        setRepoUrl(url);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        runInspection(url);
    };

    const handleForgeQuest = async (rev) => {
        // Ledger entries saved before stack auto-detection existed have no
        // detected_stack/language — re-inspect first so the forge can
        // auto-fill the weapons. Falls back to a manual pick if it fails.
        if (!rev.detected_stack && !rev.language && rev.repo_url) {
            setError('');
            setLoading(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            try {
                const res = await api.post('/review', { repo_url: rev.repo_url });
                setReview(res.data);
                setHistory(prev => [res.data, ...prev]);
                rev = res.data;
            } catch {
                // forge with what we have — Home will ask for weapons manually
            } finally {
                setLoading(false);
            }
        }
        navigate('/', { state: { prefill: improvementPrefill(rev) } });
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
                        <div style={{ marginBottom: '2rem' }}>
                            <button className="btn btn-primary" onClick={() => handleForgeQuest(review)}>
                                ⚒ Forge Improvement Quest
                            </button>
                        </div>
                    </div>
                )}

                {history.length > 0 && (
                    <div className="slide-up" style={{ marginTop: '1rem' }}>
                        <h2 style={{
                            fontFamily: 'var(--pixel-font)',
                            fontSize: '0.7rem',
                            letterSpacing: '0.1em',
                            marginBottom: '1rem'
                        }}>
                            🗞 INSPECTION LEDGER
                        </h2>
                        {history.map((rev) => (
                            <ReviewHistoryCard
                                key={rev._id || `${rev.repo}-${rev.createdAt}`}
                                review={rev}
                                onReinspect={handleReinspect}
                                onForgeQuest={handleForgeQuest}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReviewRepo;
