/**
 * Review route — POST /api/review
 *
 * Proxies a GitHub repo URL to the AI service's /review-repo endpoint
 * and persists the scored result per user. Same auth + in-memory
 * per-user rate limit pattern as routes/generate.js.
 */

const router = require('express').Router();
const axios = require('axios');
const authMiddleware = require('../middleware/auth');
const createRateLimiter = require('../middleware/rateLimit');
const Review = require('../models/Review');
const { awardFirstReview } = require('../utils/xp');

const MAX_REQUESTS = 5;
const rateLimit = createRateLimiter({
    max: MAX_REQUESTS,
    message: `Rate limit exceeded. You can review up to ${MAX_REQUESTS} repos per minute.`
});

// ---------- Routes ----------
router.post('/', authMiddleware, rateLimit, async (req, res) => {
    const { repo_url } = req.body;
    if (!repo_url || typeof repo_url !== 'string' || repo_url.trim().length < 3) {
        return res.status(422).json({ error: 'repo_url is required' });
    }

    try {
        let aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
        if (!aiUrl.startsWith('http')) {
            aiUrl = `http://${aiUrl}`;
        }

        const aiResponse = await axios.post(
            `${aiUrl}/review-repo`,
            { repo_url: repo_url.trim() },
            { timeout: 120000 } // repo fetch + LLM scoring can be slow on free-tier models
        );

        const saved = await Review.create({
            userId: req.user.id,
            repo_url: repo_url.trim(),
            ...aiResponse.data
        });

        awardFirstReview(req.user.id, saved._id).catch(err =>
            console.error('XP award (first_review) failed:', err.message)
        );

        res.json(saved);

    } catch (e) {
        console.error('Review error:', e.response?.data || e.message);

        if (e.code === 'ECONNREFUSED') {
            return res.status(503).json({
                error: 'AI service is unavailable. Please try again in a moment.'
            });
        }
        if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
            return res.status(504).json({
                error: 'Review timed out. Please try again.'
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

        res.status(500).json({ error: 'Failed to review repository. Please try again.' });
    }
});

// GET /api/review — the user's past reviews, newest first
router.get('/', authMiddleware, async (req, res) => {
    const reviews = await Review.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(reviews);
});

module.exports = router;
