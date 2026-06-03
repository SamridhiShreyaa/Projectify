/**
 * Generate route — POST /api/generate
 *
 * Changes from original:
 * - Added per-user rate limiting (5 requests per minute)
 * - Added stricter input validation
 * - Better error messages
 */

const router = require('express').Router();
const axios = require('axios');
const authMiddleware = require('../middleware/auth');
const Project = require('../models/Project');

// ---------- Simple in-memory rate limiter ----------
// Key: userId → array of timestamps
// For production, replace with Redis (e.g. express-rate-limit + rate-limit-redis)
const rateLimitStore = new Map();
const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute

// Cleanup interval to prevent memory leaks from inactive users
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
}, WINDOW_MS); // Run cleanup every minute
cleanupInterval.unref(); // Allow Node process to exit even if interval is running

function checkRateLimit(userId) {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    if (!rateLimitStore.has(userId)) {
        rateLimitStore.set(userId, []);
    }

    // Purge old timestamps
    const timestamps = rateLimitStore.get(userId).filter(t => t > windowStart);
    rateLimitStore.set(userId, timestamps);

    if (timestamps.length >= MAX_REQUESTS) {
        return false;
    }

    timestamps.push(now);
    return true;
}

// ---------- Input validation ----------
const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

function validateInput(body) {
    const errors = [];
    const { topic, difficulty, stack, hours_per_week } = body;

    if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
        errors.push('topic must be at least 3 characters');
    }
    if (topic && topic.length > 200) {
        errors.push('topic must be under 200 characters');
    }

    if (!difficulty || !VALID_DIFFICULTIES.includes(difficulty)) {
        errors.push(`difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}`);
    }

    if (!stack || typeof stack !== 'string' || stack.trim().length < 2) {
        errors.push('stack must be at least 2 characters');
    }
    if (stack && stack.length > 200) {
        errors.push('stack must be under 200 characters');
    }

    const hours = Number(hours_per_week);
    if (!hours_per_week || isNaN(hours) || hours < 1 || hours > 80) {
        errors.push('hours_per_week must be a number between 1 and 80');
    }

    return errors;
}

// ---------- Route ----------
router.post('/', authMiddleware, async (req, res) => {
    // Rate limit by user ID (authenticated, so userId is reliable)
    const allowed = checkRateLimit(req.user.id);
    if (!allowed) {
        return res.status(429).json({
            error: `Rate limit exceeded. You can generate up to ${MAX_REQUESTS} projects per minute.`
        });
    }

    // Validate
    const errors = validateInput(req.body);
    if (errors.length > 0) {
        return res.status(422).json({ error: 'Validation failed', details: errors });
    }

    const { topic, difficulty, stack, hours_per_week } = req.body;

    try {
        let aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
        if (!aiUrl.startsWith('http')) {
            aiUrl = `http://${aiUrl}`;
        }

        const aiResponse = await axios.post(
            `${aiUrl}/generate`,
            {
                topic: topic.trim(),
                difficulty,
                stack: stack.trim(),
                hours_per_week: Number(hours_per_week)
            },
            { timeout: 30000 } // 30s timeout — LLM calls can be slow
        );

        const project = aiResponse.data;

        const saved = await Project.create({
            userId: req.user.id,
            ...project,
            input: { topic, difficulty, stack, hours_per_week: Number(hours_per_week) }
        });

        res.json(saved);

    } catch (e) {
        console.error('Generate error:', e.response?.data || e.message);

        if (e.code === 'ECONNREFUSED') {
            return res.status(503).json({
                error: 'AI service is unavailable. Please try again in a moment.'
            });
        }
        if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
            return res.status(504).json({
                error: 'AI service timed out. Please try again.'
            });
        }
        if (e.response?.status === 429) {
            return res.status(429).json({
                error: 'Too many requests. Please wait a moment and try again.'
            });
        }
        if (e.response?.status === 422) {
            return res.status(422).json({
                error: 'Invalid request data.',
                details: e.response.data?.detail || []
            });
        }

        res.status(500).json({ error: 'Failed to generate project. Please try again.' });
    }
});

module.exports = router;