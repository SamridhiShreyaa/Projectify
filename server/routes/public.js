/**
 * Public routes — no authentication.
 *
 * Serves read-only shared briefs (by unlisted share token), the opt-in Quest
 * Board gallery, and the XP leaderboard. Every response is an explicit
 * allowlist: never include userId, share_token, turn_in, or repo_url. Must
 * return 404 (never 401) for unknown resources so the client's 401
 * interceptor doesn't bounce logged-out visitors to the login page.
 */
const router = require('express').Router();
const Project = require('../models/Project');
const User = require('../models/User');
const XpEvent = require('../models/XpEvent');
const { XP_PER_LEVEL } = require('../config/xp');
const { computeStats, ensureBackfill, evaluateAchievements } = require('../utils/xp');

// Shared allowlist for any publicly visible project brief
function publicProjectView(project) {
    return {
        title: project.title,
        description: project.description,
        core_features: project.core_features,
        stretch_goals: project.stretch_goals,
        scope_notes: project.scope_notes,
        milestones: project.milestones,
        completed_milestones: project.completed_milestones,
        file_structure: project.file_structure,
        learning_outcomes: project.learning_outcomes,
        resources: project.resources,
        mermaid_diagram: project.mermaid_diagram,
        skeleton_files: project.skeleton_files,
        input: project.input,
        createdAt: project.createdAt
    };
}

router.get('/projects/:token', async (req, res) => {
    try {
        const project = await Project.findOne({ share_token: req.params.token });
        if (!project) {
            return res.status(404).json({ error: 'Shared quest not found' });
        }
        res.json(publicProjectView(project));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Quest Board — paginated list of published quests
router.get('/gallery', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
        const filter = { published: true };
        if (req.query.difficulty) {
            filter['input.difficulty'] = req.query.difficulty;
        }

        const sort = req.query.sort === 'popular'
            ? { accepted_count: -1, published_at: -1 }
            : { published_at: -1 };

        const total = await Project.countDocuments(filter);
        const items = await Project.find(filter)
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit)
            .select('title description milestones input published_at accepted_count')
            .lean();

        res.json({
            items: items.map(p => ({
                _id: p._id,
                title: p.title,
                description: p.description,
                difficulty: p.input?.difficulty || '',
                stack: p.input?.stack || '',
                milestone_count: p.milestones?.length || 0,
                published_at: p.published_at,
                accepted_count: p.accepted_count || 0
            })),
            page,
            total,
            total_pages: Math.max(1, Math.ceil(total / limit))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Quest Board — full brief for one published quest
router.get('/gallery/:id', async (req, res) => {
    try {
        const project = await Project.findOne({
            _id: req.params.id,
            published: true
        });
        if (!project) {
            return res.status(404).json({ error: 'Quest not found on the board' });
        }
        res.json({ _id: project._id, ...publicProjectView(project) });
    } catch (e) {
        if (e.name === 'CastError') {
            return res.status(404).json({ error: 'Quest not found on the board' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Leaderboard — top adventurers by total XP, identities masked
const LEADERBOARD_CACHE_MS = 60 * 1000;
let leaderboardCache = { at: 0, data: null };

function maskEmail(email) {
    const local = (email || '').split('@')[0] || 'adventurer';
    const visible = local.slice(0, Math.min(7, Math.max(2, local.length - 3)));
    return `${visible}***`;
}

router.get('/leaderboard', async (req, res) => {
    try {
        const now = Date.now();
        if (leaderboardCache.data && now - leaderboardCache.at < LEADERBOARD_CACHE_MS) {
            return res.json(leaderboardCache.data);
        }

        const totals = await XpEvent.aggregate([
            { $group: { _id: '$userId', total_xp: { $sum: '$amount' } } },
            { $match: { total_xp: { $gt: 0 } } },
            { $sort: { total_xp: -1 } },
            { $limit: 10 }
        ]);

        const users = await User.find(
            { _id: { $in: totals.map(t => t._id) } },
            { email: 1 }
        ).lean();
        const emailById = new Map(users.map(u => [String(u._id), u.email]));

        const data = totals.map(t => ({
            name_masked: maskEmail(emailById.get(String(t._id))),
            total_xp: t.total_xp,
            level: 1 + Math.floor(t.total_xp / XP_PER_LEVEL)
        }));

        leaderboardCache = { at: now, data };
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Public adventurer profile — opt-in portfolio view of level, achievements,
// verified turn-ins, skill map, and published quests. 404 for unknown
// handles AND for handles that exist but haven't opted in (same response,
// so existence of an account is never leaked either way).
router.get('/adventurer/:handle', async (req, res) => {
    try {
        const user = await User.findOne({ handle: req.params.handle, public_profile: true });
        if (!user) {
            return res.status(404).json({ error: 'Adventurer not found' });
        }

        // Evaluate on read so a public profile reflects earned achievements even
        // if the owner never opened their own Guild Hall. Same as GET /api/stats.
        await ensureBackfill(user._id);
        await evaluateAchievements(user._id);
        const stats = await computeStats(user._id);

        const projects = await Project.find({ userId: user._id })
            .select('learning_outcomes published title description milestones input published_at accepted_count')
            .lean();

        const skillCounts = new Map();
        for (const p of projects) {
            for (const outcome of p.learning_outcomes || []) {
                skillCounts.set(outcome, (skillCounts.get(outcome) || 0) + 1);
            }
        }
        const skills = [...skillCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 24)
            .map(([skill, count]) => ({ skill, count }));

        const publishedQuests = projects
            .filter(p => p.published)
            .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
            .map(p => ({
                _id: p._id,
                title: p.title,
                description: p.description,
                difficulty: p.input?.difficulty || '',
                stack: p.input?.stack || '',
                milestone_count: p.milestones?.length || 0,
                accepted_count: p.accepted_count || 0
            }));

        res.json({
            handle: user.handle,
            level: stats.level,
            total_xp: stats.total_xp,
            counts: {
                quests_completed: stats.counts.quests_completed,
                stages_cleared: stats.counts.stages_cleared,
                turn_ins: stats.counts.turn_ins
            },
            achievements: stats.achievements.filter(a => a.unlocked),
            skills,
            published_quests: publishedQuests
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
