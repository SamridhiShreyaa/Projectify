import { useLocation, useNavigate } from 'react-router-dom';
import Milestone from '../components/Milestone';

const Result = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const project = location.state?.project;

    if (!project) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="empty-state">
                        <div className="icon">🔍</div>
                        <h3>NO QUEST DATA</h3>
                        <p>Accept a quest first or check your quest log.</p>
                        <button className="btn btn-primary" onClick={() => navigate('/')}>
                            ⚔ Accept a Quest
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const difficultyXP = { beginner: 30, intermediate: 60, advanced: 100 };
    const xp = difficultyXP[project.input?.difficulty] || 50;

    return (
        <div className="page-container">
            <div className="result-container">
                {/* Quest Complete Banner */}
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
                        QUEST GENERATED!
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

                {project.milestones?.length > 0 && (
                    <div className="pixel-card result-section slide-up" style={{ animationDelay: '0.2s' }}>
                        <h3><span className="icon">📅</span> Quest Stages</h3>
                        {project.milestones.map((m, i) => <Milestone key={i} milestone={m} index={i} />)}
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
                    <button className="btn btn-primary" onClick={() => navigate('/')}>
                        ⚔ New Quest
                    </button>
                    <button className="btn btn-secondary" onClick={() => navigate('/saved')}>
                        📜 Quest Log
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Result;
