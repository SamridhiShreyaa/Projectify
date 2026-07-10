const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const { ensureBackfill, evaluateAchievements, computeStats } = require('../utils/xp');

// GET /api/stats — the authenticated user's XP, level, counts, and achievements
router.get('/', authMiddleware, async (req, res) => {
    try {
        await ensureBackfill(req.user.id);
        await evaluateAchievements(req.user.id);
        const stats = await computeStats(req.user.id);
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
