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
const Review = require('../models/Review');

// ---------- Simple in-memory rate limiter (per user) ----------
const rateLimitStore = new Map();
const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute

const cleanupInterval = setInterval(() => {
    const windowStart = Date.now() - WINDOW_MS;
    for (const [userId, timestamps] of rateLimitStore.entries()) {
        const validTimestamps = timestamps.filter(t => t > windowStart);
        if (validTimestamps.length === 0) {
            rateLimitStore.delete(userId);
        } else {
            rateLimitStore.set(userId, validTimestamps);
        }
    }
}, WINDOW_MS);
cleanupInterval.unref();

function checkRateLimit(userId) {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    if (!rateLimitStore.has(userId)) {
        rateLimitStore.set(userId, []);
    }

    const timestamps = rateLimitStore.get(userId).filter(t => t > windowStart);
    rateLimitStore.set(userId, timestamps);

    if (timestamps.length >= MAX_REQUESTS) {
        return false;
    }

    timestamps.push(now);
    return true;
}

// ---------- Routes ----------
router.post('/', authMiddleware, async (req, res) => {
    const allowed = checkRateLimit(req.user.id);
    if (!allowed) {
        return res.status(429).json({
            error: `Rate limit exceeded. You can review up to ${MAX_REQUESTS} repos per minute.`
        });
    }

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
            { timeout: 60000 } // repo fetch + LLM scoring can be slow
        );

        const saved = await Review.create({
            userId: req.user.id,
            repo_url: repo_url.trim(),
            ...aiResponse.data
        });

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
