import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import QuestBrief from '../components/QuestBrief';

// Public, read-only view of a shared quest. The /api/public endpoint never
// returns 401, so the axios interceptor won't bounce logged-out visitors.
const Share = () => {
    const { token } = useParams();
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        let cancelled = false;
        api.get(`/public/projects/${token}`)
            .then(res => { if (!cancelled) setProject(res.data); })
            .catch(() => { if (!cancelled) setNotFound(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [token]);

    if (loading) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="loading-overlay">
                        <div className="loading-spinner-lg"></div>
                        <p className="loading-text">Unrolling quest scroll...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (notFound || !project) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="empty-state">
                        <div className="icon">🗞</div>
                        <h3>SCROLL NOT FOUND</h3>
                        <p>This shared quest link is invalid or has been revoked.</p>
                        <Link to="/" className="btn btn-primary">⚔ Visit the Quest Board</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="container" style={{ marginBottom: '1rem' }}>
                <div style={{
                    fontFamily: 'var(--pixel-font)',
                    fontSize: '0.5rem',
                    color: 'var(--pixel-dim)',
                    textAlign: 'center',
                    border: '1px dashed var(--pixel-dim)',
                    padding: '0.6rem',
                    letterSpacing: '0.1em'
                }}>
                    🗞 SHARED QUEST SCROLL — READ ONLY ·{' '}
                    <Link to="/signup" style={{ color: 'var(--pixel-gold)' }}>
                        FORGE YOUR OWN QUESTS
                    </Link>
                </div>
            </div>
            <QuestBrief
                project={project}
                readOnly
                completedMilestones={project.completed_milestones || []}
            />
        </div>
    );
};

export default Share;
