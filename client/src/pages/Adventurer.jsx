import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';

const DIFFICULTY_TAGS = {
    beginner: { label: '🟢 NOVICE', color: 'var(--pixel-green)' },
    intermediate: { label: '🟡 WARRIOR', color: 'var(--pixel-gold)' },
    advanced: { label: '🔴 LEGEND', color: 'var(--pixel-red)' },
};

const Adventurer = () => {
    const { handle } = useParams();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        let cancelled = false;
        api.get(`/public/adventurer/${handle}`)
            .then(res => { if (!cancelled) setProfile(res.data); })
            .catch(() => { if (!cancelled) setNotFound(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [handle]);

    if (loading) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="loading-overlay">
                        <div className="loading-spinner-lg"></div>
                        <p className="loading-text">Reading the guild ledger...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (notFound || !profile) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="empty-state">
                        <div className="icon">🔍</div>
                        <h3>ADVENTURER NOT FOUND</h3>
                        <p>This adventurer doesn't exist, or their profile is private.</p>
                        <Link to="/gallery" className="btn btn-primary">🏰 Visit the Quest Board</Link>
                    </div>
                </div>
            </div>
        );
    }

    const { counts = {} } = profile;

    return (
        <div className="page-container">
            <div className="container">
                <div className="slide-up" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎮</div>
                    <h1><span className="gradient-text">{profile.handle.toUpperCase()}</span></h1>
                    <p style={{
                        fontFamily: 'var(--pixel-font)',
                        fontSize: '0.55rem',
                        color: 'var(--pixel-gold)',
                        marginTop: '0.5rem',
                        letterSpacing: '0.1em'
                    }}>
                        LEVEL {profile.level} · {profile.total_xp} XP
                    </p>
                </div>

                <div className="stats-row" style={{ flexWrap: 'wrap', justifyContent: 'center', marginBottom: '2rem' }}>
                    {[
                        { icon: '⚑', label: 'Quests Completed', value: counts.quests_completed ?? 0 },
                        { icon: '📍', label: 'Stages Cleared', value: counts.stages_cleared ?? 0 },
                        { icon: '🏆', label: 'Verified Turn-Ins', value: counts.turn_ins ?? 0 },
                    ].map(t => (
                        <div key={t.label} className="stat-item">
                            <span>{t.icon} {t.label}:</span>
                            <span className="stat-value">{t.value}</span>
                        </div>
                    ))}
                </div>

                {profile.achievements?.length > 0 && (
                    <div className="pixel-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}><span className="icon">🎖</span> Achievements</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                            {profile.achievements.map(a => (
                                <div key={a.id} title={a.description} className="pixel-card" style={{ padding: '0.75rem', minWidth: '120px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.5rem' }}>{a.icon}</div>
                                    <div style={{ fontSize: '0.6rem', fontFamily: 'var(--pixel-font)', marginTop: '0.35rem' }}>
                                        {a.name}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {profile.skills?.length > 0 && (
                    <div className="pixel-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}><span className="icon">🧠</span> Skill Map</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {profile.skills.map(({ skill, count }) => (
                                <span key={skill} className="meta-tag" title={`Earned in ${count} quest${count > 1 ? 's' : ''}`}>
                                    {skill}{count > 1 ? ` ×${count}` : ''}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {profile.published_quests?.length > 0 && (
                    <div className="pixel-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}><span className="icon">🏰</span> Quests on the Board</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                            {profile.published_quests.map(q => {
                                const tag = DIFFICULTY_TAGS[q.difficulty];
                                return (
                                    <div key={q._id} className="pixel-card" style={{ padding: '0.75rem' }}>
                                        <div style={{ fontSize: '0.8rem', marginBottom: '0.4rem' }}>📌 {q.title}</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                            {tag && <span className="meta-tag" style={{ color: tag.color }}>{tag.label}</span>}
                                            <span className="meta-tag">📍 {q.milestone_count} stages</span>
                                            {q.accepted_count > 0 && (
                                                <span className="meta-tag" style={{ color: 'var(--pixel-gold)' }}>
                                                    ⚔ {q.accepted_count}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Adventurer;
