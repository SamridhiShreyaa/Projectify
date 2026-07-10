import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import QuestBrief from '../components/QuestBrief';
import TurnInReport from '../components/TurnInReport';

// Cosmetic pipeline cycler — the AI service doesn't stream real per-stage
// progress, so this advances on a timer to give the wait some texture while
// the actual signal (project.status) is polled in the background.
const GENERATION_STAGES = [
    'Consulting the Quest Master…',
    'Scoping requirements to your time budget…',
    'Sketching the architecture…',
    'Writing milestones, skeleton files, and resources…',
    'Reviewing the finished brief…',
];

const Result = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { id } = useParams();

    const [project, setProject] = useState(location.state?.project || null);
    const [loading, setLoading] = useState(!location.state?.project && !!id);
    const [error, setError] = useState('');
    const [completedMilestones, setCompletedMilestones] = useState(
        location.state?.project?.completed_milestones || []
    );
    const [milestoneDates, setMilestoneDates] = useState(
        location.state?.project?.milestone_dates || []
    );
    const [shareState, setShareState] = useState('idle');
    const [repoUrl, setRepoUrl] = useState('');
    const [turnInState, setTurnInState] = useState('idle'); // idle | loading
    const [turnInError, setTurnInError] = useState('');
    const [turnInXp, setTurnInXp] = useState(0);
    const [publishing, setPublishing] = useState(false);
    const [turnInHistory, setTurnInHistory] = useState([]);
    const [stageIndex, setStageIndex] = useState(0);
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (project || !id) return;
        let cancelled = false;
        api.get(`/projects/${id}`)
            .then(res => {
                if (cancelled) return;
                setProject(res.data);
                setCompletedMilestones(res.data.completed_milestones || []);
                setMilestoneDates(res.data.milestone_dates || []);
            })
            .catch(() => {
                if (!cancelled) setError('Quest not found in your log.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [id, project]);

    useEffect(() => {
        if (project?.repo_url) setRepoUrl(project.repo_url);
    }, [project]);

    const projectId = id || project?._id;

    // Poll a pending quest until the AI service finishes generating it.
    useEffect(() => {
        if (project?.status !== 'pending' || !projectId) return;
        let cancelled = false;
        let polling = false;

        const poll = async () => {
            if (polling) return;
            polling = true;
            try {
                const res = await api.get(`/projects/${projectId}`);
                if (!cancelled && res.data.status !== 'pending') {
                    setProject(res.data);
                    setCompletedMilestones(res.data.completed_milestones || []);
                    setMilestoneDates(res.data.milestone_dates || []);
                }
            } catch {
                // transient network hiccup — the next tick retries
            } finally {
                polling = false;
            }
        };

        const pollInterval = setInterval(poll, 3000);
        const stageInterval = setInterval(() => {
            setStageIndex(i => Math.min(i + 1, GENERATION_STAGES.length - 1));
        }, 12000);
        const elapsedInterval = setInterval(() => setElapsed(e => e + 1), 1000);

        return () => {
            cancelled = true;
            clearInterval(pollInterval);
            clearInterval(stageInterval);
            clearInterval(elapsedInterval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.status, projectId]);

    const handleRetry = async () => {
        try {
            await api.delete(`/projects/${projectId}`);
        } catch {
            // best-effort cleanup — navigate home regardless
        }
        navigate('/', {
            state: { prefill: { topic: project.input?.topic, stack: project.input?.stack } }
        });
    };

    useEffect(() => {
        if (!projectId || !project?.turn_in) return;
        let cancelled = false;
        api.get(`/projects/${projectId}/turn-ins`)
            .then(res => { if (!cancelled) setTurnInHistory(res.data); })
            .catch(() => { /* history is decorative — turn-in still works without it */ });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, project?.turn_in?.reviewId]);

    const handleTurnIn = async (e) => {
        e.preventDefault();
        if (!projectId || !repoUrl.trim() || turnInState === 'loading') return;
        setTurnInState('loading');
        setTurnInError('');
        setTurnInXp(0);
        try {
            const res = await api.post(`/projects/${projectId}/turn-in`, {
                repo_url: repoUrl.trim()
            });
            setProject(res.data.project);
            setCompletedMilestones(res.data.project.completed_milestones || []);
            if (res.data.xp_awarded) setTurnInXp(res.data.xp_awarded);
        } catch (err) {
            setTurnInError(err.response?.data?.error || 'Failed to verify the quest. Try again.');
        } finally {
            setTurnInState('idle');
        }
    };

    const handleToggleMilestone = async (index) => {
        if (!projectId) return;
        const prev = completedMilestones;
        const next = prev.includes(index)
            ? prev.filter(i => i !== index)
            : [...prev, index];
        setCompletedMilestones(next); // optimistic
        try {
            await api.patch(`/projects/${projectId}/progress`, {
                completed_milestones: next
            });
        } catch {
            setCompletedMilestones(prev); // revert
            setError('Failed to save progress. Try again.');
        }
    };

    const handleSetMilestoneDate = async (index, date) => {
        if (!projectId) return;
        const prev = milestoneDates;
        const next = [...prev];
        while (next.length <= index) next.push('');
        next[index] = date || '';
        setMilestoneDates(next); // optimistic
        try {
            await api.patch(`/projects/${projectId}/milestone-dates`, {
                milestone_dates: next
            });
        } catch {
            setMilestoneDates(prev); // revert
            setError('Failed to save the target date. Try again.');
        }
    };

    const handleTogglePublish = async () => {
        if (!projectId || publishing) return;
        setPublishing(true);
        try {
            if (project.published) {
                await api.delete(`/projects/${projectId}/publish`);
                setProject({ ...project, published: false });
            } else {
                const res = await api.post(`/projects/${projectId}/publish`);
                setProject({ ...project, published: true, published_at: res.data.published_at });
            }
        } catch {
            setError('Failed to update the quest board listing.');
        } finally {
            setPublishing(false);
        }
    };

    const handleShare = async () => {
        if (!projectId) return;
        try {
            const res = await api.post(`/projects/${projectId}/share`);
            const url = `${window.location.origin}/share/${res.data.share_token}`;
            await navigator.clipboard.writeText(url);
            setShareState('copied');
            setTimeout(() => setShareState('idle'), 2000);
        } catch {
            setError('Failed to create share link.');
        }
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="loading-overlay">
                        <div className="loading-spinner-lg"></div>
                        <p className="loading-text">Loading quest...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="empty-state">
                        <div className="icon">🔍</div>
                        <h3>NO QUEST DATA</h3>
                        <p>{error || 'Accept a quest first or check your quest log.'}</p>
                        <button className="btn btn-primary" onClick={() => navigate('/')}>
                            ⚔ Accept a Quest
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (project.status === 'pending') {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="loading-overlay">
                        <div className="loading-spinner-lg"></div>
                        <p className="loading-text">⚔ Forging your quest...</p>
                        <p style={{ color: 'var(--pixel-gold)', fontSize: '0.8rem', margin: '0.5rem 0' }}>
                            {GENERATION_STAGES[stageIndex]}
                        </p>
                        <p style={{ color: 'var(--pixel-dim)', fontSize: '0.7rem' }}>
                            {elapsed}s elapsed — free-tier models can take a minute or two.
                            This page updates itself, no need to refresh.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (project.status === 'failed') {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="empty-state">
                        <div className="icon">⚠</div>
                        <h3>THE FORGE FAILED</h3>
                        <p>{project.generation_error || 'Quest generation failed. Please try again.'}</p>
                        <button className="btn btn-primary" onClick={handleRetry}>
                            ⚔ Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            {error && (
                <div className="container">
                    <div className="error-message" style={{ marginBottom: '1rem' }}>⚠ {error}</div>
                </div>
            )}
            <QuestBrief
                project={project}
                completedMilestones={completedMilestones}
                onToggleMilestone={projectId ? handleToggleMilestone : undefined}
                onShare={projectId ? handleShare : undefined}
                shareState={shareState}
                milestoneDates={milestoneDates}
                onSetMilestoneDate={projectId ? handleSetMilestoneDate : undefined}
            />

            {projectId && (
                <div className="container">
                    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                        <button
                            className={`btn ${project.published ? 'btn-secondary' : 'btn-primary'}`}
                            disabled={publishing}
                            onClick={handleTogglePublish}
                        >
                            {publishing
                                ? '…'
                                : project.published
                                    ? '🪧 Remove from Quest Board'
                                    : '📣 Post to Quest Board'}
                        </button>
                        {project.published && (
                            <div style={{ fontSize: '0.65rem', opacity: 0.75, marginTop: '0.5rem' }}>
                                This quest is public on the board — other adventurers can accept it.
                            </div>
                        )}
                    </div>

                    <div className="pixel-card" style={{ marginTop: '1.5rem', padding: '1.25rem' }}>
                        <h3>⚑ Turn In Quest</h3>
                        <p style={{ fontSize: '0.75rem', opacity: 0.85, margin: '0.5rem 0 0.75rem' }}>
                            Built it? Hand the guild your GitHub repo and the inspector will
                            verify it against this quest's brief.
                        </p>
                        <form onSubmit={handleTurnIn} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="https://github.com/you/your-repo"
                                value={repoUrl}
                                onChange={(e) => setRepoUrl(e.target.value)}
                                style={{ flex: '1 1 260px' }}
                                disabled={turnInState === 'loading'}
                            />
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={turnInState === 'loading' || !repoUrl.trim()}
                            >
                                {turnInState === 'loading' ? '🔍 Inspecting…' : '⚑ Turn In'}
                            </button>
                        </form>
                        {turnInState === 'loading' && (
                            <p style={{ fontSize: '0.7rem', opacity: 0.75, marginTop: '0.75rem' }}>
                                The guild inspector is examining your work — this can take a minute…
                            </p>
                        )}
                        {turnInError && (
                            <div className="error-message" style={{ marginTop: '0.75rem' }}>⚠ {turnInError}</div>
                        )}
                        {turnInXp > 0 && (
                            <div style={{ color: 'var(--pixel-gold)', marginTop: '0.75rem', fontSize: '0.8rem' }}>
                                ✨ +{turnInXp} XP earned for verified progress!
                            </div>
                        )}
                    </div>

                    <TurnInReport
                        turnIn={project.turn_in}
                        repoUrl={project.repo_url || repoUrl}
                        history={turnInHistory}
                    />
                </div>
            )}
        </div>
    );
};

export default Result;
