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
            navigate(`/result/${project._id}`, { state: { project } });
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

    const totalMilestones = project.milestones?.length || 0;
    const doneMilestones = (project.completed_milestones || []).length;
    const isComplete = totalMilestones > 0 && doneMilestones === totalMilestones;

    return (
        <div className="pixel-card project-card fade-in" onClick={handleClick} style={{ cursor: 'pointer' }}>
            <h3 className="project-card-title">{project.title}</h3>
            {project.status === 'pending' && (
                <p style={{ color: 'var(--pixel-cyan)', fontSize: '0.7rem', margin: '0.25rem 0' }}>
                    ⏳ Forging in progress…
                </p>
            )}
            {project.status === 'failed' && (
                <p style={{ color: 'var(--pixel-red)', fontSize: '0.7rem', margin: '0.25rem 0' }}>
                    ⚠ Generation failed — tap to retry
                </p>
            )}
            <p className="project-card-desc">{project.description}</p>

            {totalMilestones > 0 && (
                <div style={{ margin: '0.5rem 0' }}>
                    <div style={{
                        fontFamily: 'var(--pixel-font)',
                        fontSize: '0.4rem',
                        color: isComplete ? 'var(--pixel-gold)' : 'var(--pixel-dim)',
                        marginBottom: '0.25rem',
                        letterSpacing: '0.1em'
                    }}>
                        {isComplete ? '⚑ COMPLETE' : `${doneMilestones}/${totalMilestones} STAGES`}
                    </div>
                    <div className="xp-bar-container" style={{ height: '8px' }}>
                        <div className="xp-bar-fill" style={{
                            width: `${(doneMilestones / totalMilestones) * 100}%`
                        }}></div>
                    </div>
                </div>
            )}

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
                    {onDelete && (
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
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProjectCard;
