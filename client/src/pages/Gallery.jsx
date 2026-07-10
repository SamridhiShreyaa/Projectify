import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import QuestBrief from '../components/QuestBrief';

const DIFFICULTY_TAGS = {
    beginner: { label: '🟢 NOVICE', color: 'var(--pixel-green)' },
    intermediate: { label: '🟡 WARRIOR', color: 'var(--pixel-gold)' },
    advanced: { label: '🔴 LEGEND', color: 'var(--pixel-red)' },
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
};

const Gallery = () => {
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();

    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [difficulty, setDifficulty] = useState('');
    const [sort, setSort] = useState('newest'); // 'newest' | 'popular'
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [leaderboard, setLeaderboard] = useState([]);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [accepting, setAccepting] = useState(false);

    const loadPage = useCallback((pageNum, diff, sortMode) => {
        setLoading(true);
        setError('');
        const params = new URLSearchParams({ page: pageNum, limit: 12 });
        if (diff) params.set('difficulty', diff);
        if (sortMode === 'popular') params.set('sort', 'popular');
        api.get(`/public/gallery?${params}`)
            .then(res => {
                setItems(res.data.items);
                setPage(res.data.page);
                setTotalPages(res.data.total_pages);
            })
            .catch(() => setError('Failed to load the quest board.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        loadPage(1, difficulty, sort);
    }, [difficulty, sort, loadPage]);

    useEffect(() => {
        api.get('/public/leaderboard')
            .then(res => setLeaderboard(res.data))
            .catch(() => { /* leaderboard is decorative — fail silently */ });
    }, []);

    const openDetail = async (id) => {
        setDetailLoading(true);
        setError('');
        try {
            const res = await api.get(`/public/gallery/${id}`);
            setDetail(res.data);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch {
            setError('That quest is no longer on the board.');
        } finally {
            setDetailLoading(false);
        }
    };

    const handleAccept = async (sourceProjectId) => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setAccepting(true);
        try {
            const res = await api.post('/projects/accept', { sourceProjectId });
            navigate(`/result/${res.data._id}`, { state: { project: res.data } });
        } catch {
            setError('Failed to accept the quest. Try again.');
            setAccepting(false);
        }
    };

    if (detail) {
        return (
            <div className="page-container">
                <div className="container" style={{ marginBottom: '1rem' }}>
                    <button className="btn btn-secondary" onClick={() => setDetail(null)}>
                        ← Back to the Board
                    </button>
                    <button
                        className="btn btn-primary"
                        style={{ marginLeft: '0.5rem' }}
                        disabled={accepting}
                        onClick={() => handleAccept(detail._id)}
                    >
                        {accepting ? '⚔ Accepting…' : '⚔ Accept Quest'}
                    </button>
                    {error && <div className="error-message" style={{ marginTop: '0.75rem' }}>⚠ {error}</div>}
                </div>
                <QuestBrief project={detail} readOnly completedMilestones={[]} />
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="container">
                <div className="slide-up" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏰</div>
                    <h1><span className="gradient-text">QUEST BOARD</span></h1>
                    <p style={{ fontSize: '0.8rem', opacity: 0.85, marginTop: '0.5rem' }}>
                        Quests posted by fellow adventurers. Accept one and make it yours.
                    </p>
                </div>

                {leaderboard.length > 0 && (
                    <div className="pixel-card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                        <h3 style={{ marginBottom: '0.75rem' }}>🏅 Hall of Fame</h3>
                        {leaderboard.map((entry, i) => (
                            <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between',
                                fontSize: '0.75rem', padding: '0.25rem 0'
                            }}>
                                <span>
                                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}{' '}
                                    {entry.name_masked}
                                </span>
                                <span style={{ color: 'var(--pixel-gold)' }}>
                                    LVL {entry.level} · {entry.total_xp} XP
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <button
                        className={`btn ${difficulty === '' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.55rem' }}
                        onClick={() => setDifficulty('')}
                    >
                        ALL
                    </button>
                    {Object.entries(DIFFICULTY_TAGS).map(([key, meta]) => (
                        <button
                            key={key}
                            className={`btn ${difficulty === key ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.55rem' }}
                            onClick={() => setDifficulty(key)}
                        >
                            {meta.label}
                        </button>
                    ))}
                    <span style={{ width: '1px', background: 'var(--pixel-border)', margin: '0 0.25rem' }}></span>
                    <button
                        className={`btn ${sort === 'newest' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.55rem' }}
                        onClick={() => setSort('newest')}
                    >
                        🆕 NEWEST
                    </button>
                    <button
                        className={`btn ${sort === 'popular' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.55rem' }}
                        onClick={() => setSort('popular')}
                    >
                        🔥 POPULAR
                    </button>
                </div>

                {error && <div className="error-message" style={{ marginBottom: '1rem' }}>⚠ {error}</div>}

                {loading || detailLoading ? (
                    <div className="loading-overlay">
                        <div className="loading-spinner-lg"></div>
                        <p className="loading-text">Reading the board...</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="empty-state slide-up">
                        <div className="icon">🪧</div>
                        <h3>THE BOARD IS EMPTY</h3>
                        <p>No quests posted yet. Publish one of yours from its quest page!</p>
                    </div>
                ) : (
                    <>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                            gap: '1rem'
                        }}>
                            {items.map(item => {
                                const tag = DIFFICULTY_TAGS[item.difficulty] || null;
                                return (
                                    <div key={item._id} className="pixel-card fade-in" style={{ padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                                        <h3 style={{ marginBottom: '0.5rem' }}>📌 {item.title}</h3>
                                        <p style={{
                                            fontSize: '0.75rem', opacity: 0.85, flex: 1,
                                            display: '-webkit-box', WebkitLineClamp: 3,
                                            WebkitBoxOrient: 'vertical', overflow: 'hidden'
                                        }}>
                                            {item.description}
                                        </p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.75rem 0' }}>
                                            {tag && <span className="meta-tag" style={{ color: tag.color }}>{tag.label}</span>}
                                            {item.stack && <span className="meta-tag">🛠 {item.stack}</span>}
                                            <span className="meta-tag">📍 {item.milestone_count} stages</span>
                                            {item.accepted_count > 0 && (
                                                <span className="meta-tag" style={{ color: 'var(--pixel-gold)' }}>
                                                    ⚔ {item.accepted_count} accepted
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className="project-card-date">{formatDate(item.published_at)}</span>
                                            <button
                                                className="btn btn-primary"
                                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.55rem' }}
                                                onClick={() => openDetail(item._id)}
                                            >
                                                📜 View Quest
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1.5rem', alignItems: 'center' }}>
                                <button
                                    className="btn btn-secondary"
                                    disabled={page <= 1}
                                    onClick={() => loadPage(page - 1, difficulty, sort)}
                                >
                                    ← Prev
                                </button>
                                <span style={{ fontSize: '0.7rem' }}>Page {page} / {totalPages}</span>
                                <button
                                    className="btn btn-secondary"
                                    disabled={page >= totalPages}
                                    onClick={() => loadPage(page + 1, difficulty, sort)}
                                >
                                    Next →
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default Gallery;
