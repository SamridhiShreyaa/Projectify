const router = require('express').Router();
const axios = require('axios');
const authMiddleware = require('../middleware/auth');
const Project = require('../models/Project');

router.post('/', authMiddleware, async (req, res) => {
    try {
        const { topic, difficulty, stack, hours_per_week } = req.body;

        if (!topic || !difficulty || !stack || !hours_per_week) {
            return res.status(400).json({ error: 'All fields are required: topic, difficulty, stack, hours_per_week' });
        }

        const aiResponse = await axios.post(
            `${process.env.AI_SERVICE_URL}/generate`,
            { topic, difficulty, stack, hours_per_week }
        );

        const project = aiResponse.data;

        const saved = await Project.create({
            userId: req.user.id,
            ...project,
            input: { topic, difficulty, stack, hours_per_week }
        });

        res.json(saved);
    } catch (e) {
        console.error('Generate error:', e.response?.data || e.message);
        const msg = e.code === 'ECONNREFUSED'
            ? 'AI service is not running. Start the AI service on port 8001.'
            : 'Failed to generate project. Please try again.';
        res.status(500).json({ error: msg });
    }
});

module.exports = router;
