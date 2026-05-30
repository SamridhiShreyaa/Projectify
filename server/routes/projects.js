const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const Project = require('../models/Project');

// Get all projects for the authenticated user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const projects = await Project.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(projects);
    } catch (e) {
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
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
