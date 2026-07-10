import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import ProjectCard from '../components/ProjectCard';

const DIFFICULTY_META = [
    { key: 'beginner', label: '🟢 Novice', color: 'var(--pixel-green)' },
    { key: 'intermediate', label: '🟡 Warrior', color: 'var(--pixel-gold)' },
    { key: 'advanced', label: '🔴 Legend', color: 'var(--pixel-red)' },
];

// Maps an XpEvent type to how it reads in the activity feed.
const ACTIVITY_META = {
    quest_accept: { icon: '⚔', label: 'Accepted a quest' },
    milestone: { icon: '📍', label: 'Cleared a stage' },
    turn_in: { icon: '🏆', label: 'Turned in a quest' },
    first_review: { icon: '🔍', label: 'Inspected a repo' },
    achievement: { icon: '🎖', label: 'Unlocked an achievement' },
    quest_authored: { icon: '📣', label: 'A quest of yours was accepted' },
};

const timeAgo = (dateStr) => {
    const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
};

const Dashboard = () => {
    const { name, email } = useAuth();
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        Promise.all([api.get('/projects'), api.get('/stats')])
            .then(([projRes, statsRes]) => {
                if (cancelled) return;
                setProjects(projRes.data);
                setStats(statsRes.data);
            })
            .catch(() => { if (!cancelled) setError('Failed to load your dashboard'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="loading-overlay">
                        <div className="loading-spinner-lg"></div>
                        <p className="loading-text">Loading your dashboard...</p>
                    </div>
                </div>
            </div>
        );
    }

    const displayName = (name || (email ? email.split('@')[0] : 'Adventurer'));
    const counts = stats?.counts || {};
    const level = stats?.level ?? 1;
    const intoLevel = stats?.xp_into_level ?? 0;
    const xpPerLevel = stats?.xp_per_level ?? 250;
    const achievements = (stats?.achievements || []).filter(a => a.unlocked);
    // Only surface user-meaningful events — skips internal markers like 'backfill'.
    const events = (stats?.recent_events || []).filter(e => ACTIVITY_META[e.type]);

    const difficultyCounts = DIFFICULTY_META.map(d => ({
        ...d,
        count: projects.filter(p => p.input?.difficulty === d.key).length
    }));
    const maxCount = Math.max(1, ...difficultyCounts.map(d => d.count));

    // Skill map — tally learning outcomes across all quests (data already on projects).
    const skillCounts = new Map();
    for (const p of projects) {
        for (const outcome of p.learning_outcomes || []) {
            skillCounts.set(outcome, (skillCounts.get(outcome) || 0) + 1);
        }
    }
    const skills = [...skillCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
    const maxSkillCount = Math.max(1, ...skills.map(([, count]) => count));

    const recentQuests = projects.slice(0, 4);

    const tiles = [
        { icon: '⚔', label: 'Quests Accepted', value: counts.quests ?? 0 },
        { icon: '⚑', label: 'Quests Completed', value: counts.quests_completed ?? 0 },
        { icon: '📍', label: 'Stages Cleared', value: counts.stages_cleared ?? 0 },
        { icon: '🔍', label: 'Repos Inspected', value: counts.reviews ?? 0 },
        { icon: '🏆', label: 'Quests Turned In', value: counts.turn_ins ?? 0 },
        { icon: '✨', label: 'Total XP', value: stats?.total_xp ?? 0 },
    ];

    return (
        <div className="page-container">
            <div className="container">
                {/* Greeting + level */}
                <div className="slide-up" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏰</div>
                    <h1>Welcome back, <span className="gradient-text">{displayName}</span></h1>
                    <p style={{
                        fontFamily: 'var(--pixel-font)', fontSize: '0.55rem',
                        color: 'var(--pixel-gold)', marginTop: '0.5rem', letterSpacing: '0.1em'
                    }}>
                        🎮 LEVEL {level}
                    </p>
                    <div className="xp-bar-container" style={{ maxWidth: '300px', margin: '0.75rem auto 0.25rem' }}>
                        <div className="xp-bar-fill" style={{ width: `${(intoLevel / xpPerLevel) * 100}%` }}></div>
                    </div>
                    <div style={{ fontFamily: 'var(--pixel-font)', fontSize: '0.4rem', color: 'var(--pixel-dim)' }}>
                        {intoLevel}/{xpPerLevel} XP TO LEVEL {level + 1}
                    </div>
                </div>

                {error && <div className="error-message" style={{ marginBottom: '1rem' }}>⚠ {error}</div>}

                {/* Quick actions */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '2rem' }}>
                    <button className="btn btn-primary" onClick={() => navigate('/')}>⚔ New Quest</button>
                    <button className="btn btn-secondary" onClick={() => navigate('/gallery')}>🏰 Quest Board</button>
                    <button className="btn btn-secondary" onClick={() => navigate('/review')}>🔍 Inspect Repo</button>
                    <button className="btn btn-secondary" onClick={() => navigate('/saved')}>📜 Quest Log</button>
                </div>

                {/* Stat tiles */}
                <div className="stats-row" style={{ flexWrap: 'wrap', justifyContent: 'center', marginBottom: '2rem' }}>
                    {tiles.map(t => (
                        <div key={t.label} className="stat-item">
                            <span>{t.icon} {t.label}:</span>
                            <span className="stat-value">{t.value}</span>
                        </div>
                    ))}
                </div>

                {projects.length === 0 ? (
                    <div className="empty-state slide-up">
                        <div className="icon">⚔️</div>
                        <h3>YOUR ADVENTURE AWAITS</h3>
                        <p>Accept your first quest to start earning XP and filling your dashboard!</p>
                        <button className="btn btn-primary" onClick={() => navigate('/')}>
                            ⚔ Accept First Quest
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Recent activity */}
                        {events.length > 0 && (
                            <div className="pixel-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                                <h3 style={{ marginBottom: '1rem' }}><span className="icon">📰</span> Recent Activity</h3>
                                {events.map((e, i) => {
                                    const meta = ACTIVITY_META[e.type] || { icon: '✨', label: e.type };
                                    return (
                                        <div key={i} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            fontSize: '0.75rem', padding: '0.35rem 0',
                                            borderBottom: i < events.length - 1 ? '1px solid var(--pixel-border)' : 'none'
                                        }}>
                                            <span>{meta.icon} {meta.label}</span>
                                            <span style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                                {e.amount > 0 && (
                                                    <span style={{ color: 'var(--pixel-green)' }}>+{e.amount} XP</span>
                                                )}
                                                <span style={{ color: 'var(--pixel-dim)', fontSize: '0.65rem' }}>
                                                    {timeAgo(e.createdAt)}
                                                </span>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Recent quests */}
                        <div style={{ marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
                                <h3><span className="icon">📜</span> Recent Quests</h3>
                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.55rem' }} onClick={() => navigate('/saved')}>
                                    View all →
                                </button>
                            </div>
                            <div className="projects-grid">
                                {recentQuests.map(p => (
                                    <ProjectCard key={p._id} project={p} />
                                ))}
                            </div>
                        </div>

                        {/* Difficulty chart */}
                        <div className="pixel-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                            <h3 style={{ marginBottom: '1rem' }}><span className="icon">📊</span> Dungeon Levels Braved</h3>
                            {difficultyCounts.map(d => (
                                <div key={d.key} style={{ marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                        <span>{d.label}</span>
                                        <span style={{ color: d.color }}>{d.count}</span>
                                    </div>
                                    <div className="xp-bar-container" style={{ height: '10px' }}>
                                        <div className="xp-bar-fill" style={{ width: `${(d.count / maxCount) * 100}%`, background: d.color }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Achievements */}
                        {achievements.length > 0 && (
                            <div className="pixel-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                                <h3 style={{ marginBottom: '1rem' }}><span className="icon">🎖</span> Achievements</h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    {achievements.map(a => (
                                        <div key={a.id} title={a.description} className="pixel-card" style={{ padding: '0.75rem', minWidth: '120px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.5rem' }}>{a.icon}</div>
                                            <div style={{ fontSize: '0.6rem', fontFamily: 'var(--pixel-font)', marginTop: '0.35rem' }}>{a.name}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Skill map */}
                        {skills.length > 0 && (
                            <div className="pixel-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                                <h3 style={{ marginBottom: '1rem' }}><span className="icon">🧠</span> Skill Map</h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {skills.map(([skill, count]) => {
                                        const weight = count / maxSkillCount;
                                        return (
                                            <span key={skill} className="meta-tag" title={`Earned in ${count} quest${count > 1 ? 's' : ''}`}
                                                style={{
                                                    fontSize: `${0.65 + weight * 0.35}rem`,
                                                    opacity: 0.6 + weight * 0.4,
                                                    color: weight > 0.66 ? 'var(--pixel-gold)' : weight > 0.33 ? 'var(--pixel-cyan)' : 'var(--pixel-white)'
                                                }}>
                                                {skill}{count > 1 ? ` ×${count}` : ''}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
