const router = require('express').Router();
const crypto = require('crypto');
const axios = require('axios');
const authMiddleware = require('../middleware/auth');
const createRateLimiter = require('../middleware/rateLimit');
const Project = require('../models/Project');
const Review = require('../models/Review');
const { awardMilestones, awardTurnInTiers, awardQuestAccept, awardAuthorAccept } = require('../utils/xp');

const MAX_TURN_INS = 5;
const turnInRateLimit = createRateLimiter({
    max: MAX_TURN_INS,
    message: `Rate limit exceeded. You can turn in up to ${MAX_TURN_INS} quests per minute.`
});

// Get all projects for the authenticated user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const projects = await Project.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(projects);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get a single project (owner only)
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const project = await Project.findOne({
            _id: req.params.id,
            userId: req.user.id
        });
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.json(project);
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Update milestone completion state
router.patch('/:id/progress', authMiddleware, async (req, res) => {
    const { completed_milestones } = req.body;

    if (!Array.isArray(completed_milestones)) {
        return res.status(422).json({ error: 'completed_milestones must be an array of milestone indices' });
    }

    try {
        const project = await Project.findOne({
            _id: req.params.id,
            userId: req.user.id
        });
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const total = project.milestones?.length || 0;
        const valid = completed_milestones.every(
            i => Number.isInteger(i) && i >= 0 && i < total
        );
        if (!valid) {
            return res.status(422).json({
                error: `completed_milestones must contain integers between 0 and ${total - 1}`
            });
        }

        const before = new Set(project.completed_milestones || []);
        const after = [...new Set(completed_milestones)].sort((a, b) => a - b);
        const newlyCompleted = after.filter(i => !before.has(i));

        project.completed_milestones = after;
        await project.save();

        if (newlyCompleted.length > 0) {
            awardMilestones(req.user.id, project._id, newlyCompleted).catch(err =>
                console.error('XP award (milestone) failed:', err.message)
            );
        }

        res.json(project);
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Set optional per-stage target dates (index-aligned with milestones)
router.patch('/:id/milestone-dates', authMiddleware, async (req, res) => {
    const { milestone_dates } = req.body;

    if (!Array.isArray(milestone_dates)) {
        return res.status(422).json({ error: 'milestone_dates must be an array of "YYYY-MM-DD" strings (or "")' });
    }
    const validFormat = milestone_dates.every(
        d => d === '' || (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    );
    if (!validFormat) {
        return res.status(422).json({ error: 'Each date must be "YYYY-MM-DD" or an empty string' });
    }

    try {
        const project = await Project.findOne({
            _id: req.params.id,
            userId: req.user.id
        });
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const total = project.milestones?.length || 0;
        if (milestone_dates.length > total) {
            return res.status(422).json({
                error: `milestone_dates cannot have more than ${total} entries`
            });
        }

        project.milestone_dates = milestone_dates;
        await project.save();
        res.json(project);
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(500).json({ error: e.message });
    }
});

// History of turn-in attempts for a project, oldest first (for a progress chart)
router.get('/:id/turn-ins', authMiddleware, async (req, res) => {
    try {
        const project = await Project.findOne({
            _id: req.params.id,
            userId: req.user.id
        });
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const reviews = await Review.find({
            projectId: project._id,
            kind: 'turn_in'
        }).sort({ createdAt: 1 });

        res.json(reviews.map(r => ({
            _id: r._id,
            createdAt: r.createdAt,
            percent: r.verification?.completion?.percent ?? 0,
            verdict: r.verification?.completion?.verdict || 'not_started'
        })));
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Turn in a quest: verify a GitHub repo against this project's brief
router.post('/:id/turn-in', authMiddleware, turnInRateLimit, async (req, res) => {
    const { repo_url } = req.body;
    if (!repo_url || typeof repo_url !== 'string' || repo_url.trim().length < 3) {
        return res.status(422).json({ error: 'repo_url is required' });
    }

    try {
        const project = await Project.findOne({
            _id: req.params.id,
            userId: req.user.id
        });
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        let aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
        if (!aiUrl.startsWith('http')) {
            aiUrl = `http://${aiUrl}`;
        }

        const aiResponse = await axios.post(
            `${aiUrl}/verify-quest`,
            {
                repo_url: repo_url.trim(),
                brief: {
                    title: project.title || 'Untitled quest',
                    core_features: project.core_features || [],
                    stretch_goals: project.stretch_goals || [],
                    milestones: project.milestones || [],
                    stack: project.input?.stack || ''
                }
            },
            { timeout: 120000 } // repo fetch + LLM judging can be slow on free-tier models
        );

        const verification = aiResponse.data;

        const review = await Review.create({
            userId: req.user.id,
            kind: 'turn_in',
            projectId: project._id,
            repo_url: repo_url.trim(),
            repo: verification.repo,
            mode: verification.mode,
            language: verification.language,
            verification
        });

        project.repo_url = repo_url.trim();
        project.turn_in = {
            percent: verification.completion?.percent,
            verdict: verification.completion?.verdict,
            summary: verification.completion?.summary,
            mode: verification.mode,
            features: verification.features,
            milestones: verification.milestones,
            stack_match: verification.stack_match,
            reviewId: review._id,
            verified_at: new Date()
        };
        await project.save();

        let xp_awarded = 0;
        if (verification.completion?.verdict && verification.completion.verdict !== 'not_started') {
            xp_awarded = await awardTurnInTiers(
                req.user.id, project._id, verification.completion.verdict
            );
        }

        res.json({ project, review, xp_awarded });
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Project not found' });
        }
        if (e.code === 'ECONNREFUSED') {
            return res.status(503).json({
                error: 'AI service is unavailable. Please try again in a moment.'
            });
        }
        if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
            return res.status(504).json({
                error: 'Verification timed out. Please try again.'
            });
        }
        if (e.response?.status === 404) {
            return res.status(404).json({
                error: 'Repository not found. Check the URL — private repos are not supported.'
            });
        }
        if (e.response?.status === 422) {
            return res.status(422).json({
                error: 'That does not look like a valid GitHub repository URL.'
            });
        }
        if (e.response?.status === 429) {
            return res.status(429).json({
                error: 'Too many requests. Please wait a moment and try again.'
            });
        }
        if (e.response?.status === 503) {
            return res.status(503).json({
                error: 'GitHub API rate limit reached. Please try again later.'
            });
        }

        console.error('Turn-in error:', e.response?.data || e.message);
        res.status(500).json({ error: 'Failed to verify the quest. Please try again.' });
    }
});

// Publish a quest to the public Quest Board (opt-in, distinct from share links)
router.post('/:id/publish', authMiddleware, async (req, res) => {
    try {
        const project = await Project.findOne({
            _id: req.params.id,
            userId: req.user.id
        });
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        if (!project.published) {
            project.published = true;
            project.published_at = new Date();
            await project.save();
        }
        res.json({ published: true, published_at: project.published_at });
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Remove a quest from the Quest Board
router.delete('/:id/publish', authMiddleware, async (req, res) => {
    try {
        const project = await Project.findOne({
            _id: req.params.id,
            userId: req.user.id
        });
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        project.published = false;
        project.published_at = undefined;
        await project.save();
        res.json({ published: false });
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Accept a published quest from the Quest Board: clone it into the user's log
router.post('/accept', authMiddleware, async (req, res) => {
    const { sourceProjectId } = req.body;
    if (!sourceProjectId) {
        return res.status(422).json({ error: 'sourceProjectId is required' });
    }

    try {
        const source = await Project.findOne({
            _id: sourceProjectId,
            published: true
        });
        if (!source) {
            return res.status(404).json({ error: 'Quest not found on the board' });
        }
        if (String(source.userId) === String(req.user.id)) {
            return res.status(422).json({ error: 'You already own this quest' });
        }

        const clone = await Project.create({
            userId: req.user.id,
            title: source.title,
            description: source.description,
            core_features: source.core_features,
            stretch_goals: source.stretch_goals,
            file_structure: source.file_structure,
            milestones: source.milestones,
            learning_outcomes: source.learning_outcomes,
            resources: source.resources,
            skeleton_files: source.skeleton_files,
            mermaid_diagram: source.mermaid_diagram,
            completed_milestones: [],
            origin: { kind: 'gallery', sourceProjectId: source._id },
            input: source.input
        });

        // Accept-farming is bounded by the manual click and normal API limits;
        // each clone is a distinct projectId so the award key is fresh by design.
        awardQuestAccept(req.user.id, clone).catch(err =>
            console.error('XP award (gallery accept) failed:', err.message)
        );
        awardAuthorAccept(source.userId, clone._id).catch(err =>
            console.error('XP award (author accept) failed:', err.message)
        );

        source.accepted_count = (source.accepted_count || 0) + 1;
        await source.save();

        res.json(clone);
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Quest not found on the board' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Create (or return existing) share token for a project
router.post('/:id/share', authMiddleware, async (req, res) => {
    try {
        const project = await Project.findOne({
            _id: req.params.id,
            userId: req.user.id
        });
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        if (!project.share_token) {
            project.share_token = crypto.randomBytes(32).toString('hex');
            await project.save();
        }

        res.json({
            share_token: project.share_token,
            share_url: `/share/${project.share_token}`
        });
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Revoke a project's share token
router.delete('/:id/share', authMiddleware, async (req, res) => {
    try {
        const project = await Project.findOne({
            _id: req.params.id,
            userId: req.user.id
        });
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        project.share_token = undefined;
        await project.save();
        res.json({ success: true });
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Delete a specific project
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const result = await Project.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id
        });
        if (!result) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.json({ success: true });
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
