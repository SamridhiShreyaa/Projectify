/**
 * Generate route — POST /api/generate
 *
 * Async ("job-style"): the LLM pipeline can take 60-150s on free-tier
 * models, far past what a single HTTP request should hold open. Instead of
 * blocking the request, this creates a `pending` Project immediately and
 * returns 202, then runs the AI call in the background and updates the same
 * document to `complete` (full brief) or `failed` (with generation_error)
 * when it settles. The client polls GET /projects/:id until status changes.
 */

const router = require('express').Router();
const axios = require('axios');
const authMiddleware = require('../middleware/auth');
const createRateLimiter = require('../middleware/rateLimit');
const Project = require('../models/Project');
const Review = require('../models/Review');
const { awardQuestAccept } = require('../utils/xp');

const MAX_REQUESTS = 5;
const rateLimit = createRateLimiter({
    max: MAX_REQUESTS,
    message: `Rate limit exceeded. You can generate up to ${MAX_REQUESTS} projects per minute.`
});

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

function generationErrorFor(e) {
    if (e.code === 'ECONNREFUSED') {
        return 'AI service is unavailable. Please try again in a moment.';
    }
    if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
        return 'AI service timed out. Please try again.';
    }
    if (e.response?.status === 429) {
        return 'Too many requests to the AI service. Please try again shortly.';
    }
    if (e.response?.status === 422) {
        return 'The AI service rejected this request.';
    }
    return 'Failed to generate project. Please try again.';
}

// Runs after the response is sent — updates the pending project in place.
async function runGeneration(projectId, userId, { topic, difficulty, stack, hours_per_week }, sourceReviewId) {
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
            { timeout: 150000 } // the pipeline chains 3+ sequential LLM calls; free-tier models can take 30-50s each
        );

        const brief = aiResponse.data;

        // Optional provenance: this quest was forged from one of the user's
        // repo reviews. Invalid or foreign ids are ignored, never fatal.
        let provenance = {};
        if (sourceReviewId) {
            try {
                const sourceReview = await Review.findOne({ _id: sourceReviewId, userId });
                if (sourceReview) {
                    provenance = {
                        sourceReviewId: sourceReview._id,
                        source_repo: sourceReview.repo
                    };
                }
            } catch {
                // CastError on garbage ids — ignore silently
            }
        }

        const updated = await Project.findByIdAndUpdate(
            projectId,
            { ...brief, ...provenance, status: 'complete', generation_error: undefined },
            { new: true }
        );
        if (!updated) return; // deleted while pending — nothing to finish

        awardQuestAccept(userId, updated).catch(err =>
            console.error('XP award (quest_accept) failed:', err.message)
        );
    } catch (e) {
        console.error('Generate error:', e.response?.data || e.message);
        await Project.findByIdAndUpdate(projectId, {
            status: 'failed',
            generation_error: generationErrorFor(e)
        }).catch(err => console.error('Failed to record generation failure:', err.message));
    }
}

// ---------- Route ----------
router.post('/', authMiddleware, rateLimit, async (req, res) => {
    // Validate
    const errors = validateInput(req.body);
    if (errors.length > 0) {
        return res.status(422).json({ error: 'Validation failed', details: errors });
    }

    const { topic, difficulty, stack, hours_per_week, source_review_id } = req.body;
    const input = { topic, difficulty, stack, hours_per_week: Number(hours_per_week) };

    try {
        const pending = await Project.create({
            userId: req.user.id,
            title: `Forging: ${topic.trim()}`,
            status: 'pending',
            input
        });

        res.status(202).json(pending);

        // Intentionally not awaited — the response above is the full contract
        // for this request; runGeneration finishes the document later.
        runGeneration(pending._id, req.user.id, input, source_review_id);
    } catch (e) {
        res.status(500).json({ error: 'Failed to start quest generation. Please try again.' });
    }
});

module.exports = router;
