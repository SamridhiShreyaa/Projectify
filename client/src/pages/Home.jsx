import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';

const CUSTOM = '__custom__';

const TOPICS = [
    { value: 'Web Development', icon: '🌐', label: 'Web Development' },
    { value: 'Mobile App', icon: '📱', label: 'Mobile App' },
    { value: 'Data Science', icon: '📊', label: 'Data Science' },
    { value: 'Machine Learning', icon: '🤖', label: 'Machine Learning' },
    { value: 'DevOps', icon: '⚙️', label: 'DevOps' },
    { value: 'Blockchain', icon: '⛓️', label: 'Blockchain' },
    { value: 'Game Development', icon: '🎮', label: 'Game Dev' },
    { value: 'IoT', icon: '📡', label: 'IoT' },
    { value: 'Cybersecurity', icon: '🛡️', label: 'Cybersecurity' },
    { value: 'Cloud Computing', icon: '☁️', label: 'Cloud' },
    { value: 'API Development', icon: '🔌', label: 'API Dev' },
    { value: 'E-Commerce', icon: '🛒', label: 'E-Commerce' },
];

const STACKS = [
    'React + Node.js', 'React + Python/FastAPI', 'Vue.js + Express',
    'Next.js + Prisma', 'Python + Django', 'Python + Flask',
    'React Native', 'Flutter + Firebase', 'MERN Stack',
    'Java + Spring Boot', 'Go + React', 'Rust + WebAssembly',
];

const Home = () => {
    const location = useLocation();
    // Prefill from the repo reviewer's "Forge Improvement Quest" action
    const prefill = location.state?.prefill;

    const [topic, setTopic] = useState(prefill?.topic ? CUSTOM : '');
    const [customTopic, setCustomTopic] = useState(prefill?.topic || '');
    const [difficulty, setDifficulty] = useState('');
    const [stack, setStack] = useState(prefill?.stack ? CUSTOM : '');
    const [customStack, setCustomStack] = useState(prefill?.stack || '');
    const [hoursPerWeek, setHoursPerWeek] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleGenerate = async (e) => {
        e.preventDefault();
        setError('');

        const effectiveTopic = (topic === CUSTOM ? customTopic : topic).trim();
        const effectiveStack = (stack === CUSTOM ? customStack : stack).trim();

        if (!effectiveTopic || !difficulty || !effectiveStack || !hoursPerWeek) {
            setError('All quest parameters required!');
            return;
        }
        if (effectiveTopic.length < 3) {
            setError('topic must be at least 3 characters');
            return;
        }
        if (effectiveStack.length < 2) {
            setError('stack must be at least 2 characters');
            return;
        }

        setLoading(true);

        try {
            const res = await api.post('/generate', {
                topic: effectiveTopic,
                difficulty,
                stack: effectiveStack,
                hours_per_week: parseInt(hoursPerWeek),
                // Provenance: quest forged from a repo review (ignored if absent)
                ...(prefill?.source_review_id
                    ? { source_review_id: prefill.source_review_id }
                    : {})
            });
            navigate(`/result/${res.data._id}`, { state: { project: res.data } });
        } catch (err) {
            setError(err.response?.data?.error || 'Quest generation failed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="loading-overlay">
                        <div className="loading-spinner-lg"></div>
                        <p className="loading-text">⚔ Generating your quest...</p>
                        <p style={{ color: 'var(--pixel-dim)', fontSize: '0.8rem', fontFamily: 'var(--pixel-body)' }}>
                            The quest master is preparing your adventure
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="container">
                <div className="hero slide-up">
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }} className="pixel-float">⚔️</div>
                    <h1>
                        <span className="gradient-text">QUEST</span>{' '}
                        <span style={{ color: 'var(--pixel-white)' }}>BOARD</span>
                    </h1>
                    <p>
                        Choose your quest parameters and our AI Quest Master will forge
                        a complete project adventure with milestones and loot.
                    </p>
                </div>

                <div className="pixel-card generate-form slide-up" style={{ animationDelay: '0.1s' }}>
                    <div style={{
                        fontFamily: 'var(--pixel-font)',
                        fontSize: '0.5rem',
                        color: 'var(--pixel-gold)',
                        textAlign: 'center',
                        marginBottom: '1.5rem',
                        letterSpacing: '0.15em'
                    }}>
                        ═══ CONFIGURE YOUR QUEST ═══
                    </div>

                    <form onSubmit={handleGenerate}>
                        {prefill?.source_repo && (
                            <div style={{
                                fontFamily: 'var(--pixel-font)',
                                fontSize: '0.45rem',
                                color: 'var(--pixel-gold)',
                                textAlign: 'center',
                                marginBottom: '1rem',
                                letterSpacing: '0.1em'
                            }}>
                                ⚒ FORGING IMPROVEMENT QUEST FOR {prefill.source_repo.toUpperCase()}
                                <div style={{ color: 'var(--pixel-dim)', marginTop: '0.35rem' }}>
                                    {prefill.stack
                                        ? 'WEAPONS AUTO-DETECTED FROM THE REPO — EDIT IF NEEDED'
                                        : 'OLDER INSPECTION — RE-INSPECT THE REPO TO AUTO-DETECT WEAPONS, OR PICK THEM BELOW'}
                                </div>
                            </div>
                        )}
                        {error && <div className="error-message" style={{ marginBottom: '1rem' }}>⚠ {error}</div>}

                        <div className="form-grid">
                            <div className="form-group full-width">
                                <label className="form-label" htmlFor="topic">🗺️ Quest Domain</label>
                                <select id="topic" className="form-select" value={topic}
                                    onChange={(e) => setTopic(e.target.value)} required>
                                    <option value="">Select quest type...</option>
                                    {TOPICS.map(t => (
                                        <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                                    ))}
                                    <option value={CUSTOM}>✎ Custom Quest…</option>
                                </select>
                                {topic === CUSTOM && (
                                    <input
                                        type="text"
                                        className="form-select"
                                        style={{ marginTop: '0.5rem' }}
                                        placeholder="Describe your quest domain…"
                                        value={customTopic}
                                        onChange={(e) => setCustomTopic(e.target.value)}
                                        minLength={3}
                                        maxLength={200}
                                        required
                                    />
                                )}
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="difficulty">⚡ Dungeon Level</label>
                                <select id="difficulty" className="form-select" value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value)} required>
                                    <option value="">Select level...</option>
                                    <option value="beginner">🟢 Novice</option>
                                    <option value="intermediate">🟡 Warrior</option>
                                    <option value="advanced">🔴 Legend</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="hours">⏰ Time / Week</label>
                                <select id="hours" className="form-select" value={hoursPerWeek}
                                    onChange={(e) => setHoursPerWeek(e.target.value)} required>
                                    <option value="">Quest time...</option>
                                    <option value="3">3 hours</option>
                                    <option value="5">5 hours</option>
                                    <option value="10">10 hours</option>
                                    <option value="15">15 hours</option>
                                    <option value="20">20+ hours</option>
                                </select>
                            </div>

                            <div className="form-group full-width">
                                <label className="form-label" htmlFor="stack">🛡️ Weapon Choice</label>
                                <select id="stack" className="form-select" value={stack}
                                    onChange={(e) => setStack(e.target.value)} required>
                                    <option value="">Choose your weapon...</option>
                                    {STACKS.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                    <option value={CUSTOM}>✎ Custom weapon…</option>
                                </select>
                                {stack === CUSTOM && (
                                    <input
                                        type="text"
                                        className="form-select"
                                        style={{ marginTop: '0.5rem' }}
                                        placeholder="Name your weapons (e.g. Svelte + Go)…"
                                        value={customStack}
                                        onChange={(e) => setCustomStack(e.target.value)}
                                        minLength={2}
                                        maxLength={200}
                                        required
                                    />
                                )}
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                            ⚔ ACCEPT QUEST
                        </button>
                    </form>
                </div>

                <div style={{
                    textAlign: 'center', marginTop: '1.5rem',
                    fontFamily: 'var(--pixel-font)', fontSize: '0.4rem',
                    color: 'var(--pixel-dim)', letterSpacing: '0.1em'
                }}>
                    EACH QUEST IS SAVED TO YOUR QUEST LOG
                </div>
            </div>
        </div>
    );
};

export default Home;
