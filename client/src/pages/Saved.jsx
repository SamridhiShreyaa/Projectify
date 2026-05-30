import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import ProjectCard from '../components/ProjectCard';

const Saved = () => {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            const res = await api.get('/projects');
            setProjects(res.data);
        } catch (err) {
            setError('Failed to load quest log');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/projects/${id}`);
            setProjects(prev => prev.filter(p => p._id !== id));
        } catch (err) {
            setError('Failed to abandon quest');
        }
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="loading-overlay">
                        <div className="loading-spinner-lg"></div>
                        <p className="loading-text">Loading quest log...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="container">
                <div className="slide-up" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📜</div>
                    <h1>
                        <span className="gradient-text">QUEST LOG</span>
                    </h1>
                    <div style={{
                        marginTop: '0.75rem'
                    }}>
                        <div className="stats-row">
                            <div className="stat-item">
                                <span>Quests:</span>
                                <span className="stat-value">{projects.length}</span>
                            </div>
                            <div className="stat-item">
                                <span>Status:</span>
                                <span className="stat-value" style={{ color: 'var(--pixel-green)' }}>Active</span>
                            </div>
                        </div>
                    </div>
                </div>

                {error && <div className="error-message" style={{ marginBottom: '1rem' }}>⚠ {error}</div>}

                {projects.length === 0 ? (
                    <div className="empty-state slide-up">
                        <div className="icon">⚔️</div>
                        <h3>NO QUESTS YET</h3>
                        <p>Accept your first quest from the Quest Board!</p>
                        <button className="btn btn-primary" onClick={() => navigate('/')}>
                            ⚔ Accept First Quest
                        </button>
                    </div>
                ) : (
                    <div className="projects-grid">
                        {projects.map((project) => (
                            <ProjectCard
                                key={project._id}
                                project={project}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Saved;
