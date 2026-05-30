import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ProjectCard = ({ project, onDelete }) => {
    const navigate = useNavigate();
    const [confirming, setConfirming] = useState(false);

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    const handleClick = () => {
        if (!confirming) {
            navigate('/result', { state: { project } });
        }
    };

    const handleDeleteClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (confirming) {
            onDelete(project._id);
        } else {
            setConfirming(true);
            // Auto-reset confirmation after 3 seconds
            setTimeout(() => {
                setConfirming(false);
            }, 3000);
        }
    };

    const difficultyColor = {
        beginner: 'var(--pixel-green)',
        intermediate: 'var(--pixel-gold)',
        advanced: 'var(--pixel-red)',
    };

    return (
        <div className="pixel-card project-card fade-in" onClick={handleClick} style={{ cursor: 'pointer' }}>
            <h3 className="project-card-title">{project.title}</h3>
            <p className="project-card-desc">{project.description}</p>

            <div className="project-card-footer">
                <div className="project-card-tags">
                    {project.input?.difficulty && (
                        <span className="meta-tag" style={{
                            borderColor: difficultyColor[project.input.difficulty] || 'var(--pixel-purple)',
                            color: difficultyColor[project.input.difficulty] || 'var(--pixel-purple)',
                        }}>
                            {project.input.difficulty}
                        </span>
                    )}
                    {project.input?.stack && (
                        <span className="meta-tag">{project.input.stack}</span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="project-card-date">
                        {formatDate(project.createdAt)}
                    </span>
                    <button
                        className={`btn ${confirming ? 'btn-primary' : 'btn-danger'}`}
                        onClick={handleDeleteClick}
                        style={{ 
                            position: 'relative', 
                            zIndex: 10, 
                            padding: '0.3rem 0.6rem', 
                            fontSize: '0.5rem', 
                            boxShadow: '2px 2px 0 #000',
                            backgroundColor: confirming ? 'var(--pixel-purple)' : undefined
                        }}
                    >
                        {confirming ? 'SURE?' : '✕'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProjectCard;
