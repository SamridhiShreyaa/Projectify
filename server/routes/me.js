const router = require('express').Router();
const bcrypt = require('bcrypt');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Project = require('../models/Project');
const Review = require('../models/Review');
const XpEvent = require('../models/XpEvent');
const { generateHandle } = require('../utils/handle');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/me — the authenticated user's account + public identity settings
router.get('/', authMiddleware, async (req, res) => {
    try {
        let user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Lazy backfill for accounts created before these fields existed
        let dirty = false;
        if (!user.handle) {
            user.handle = await generateHandle(user.email);
            dirty = true;
        }
        if (!user.name) {
            user.name = user.email.split('@')[0];
            dirty = true;
        }
        if (dirty) await user.save();

        res.json({
            email: user.email,
            name: user.name,
            handle: user.handle,
            public_profile: user.public_profile,
            createdAt: user.createdAt
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/me/profile — update display name
router.patch('/profile', authMiddleware, async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 1 || name.length > 50) {
        return res.status(422).json({ error: 'name must be between 1 and 50 characters' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        user.name = name;
        await user.save();
        res.json({ name: user.name });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/me/email — change login email (requires current password)
router.patch('/email', authMiddleware, async (req, res) => {
    const { email, current_password } = req.body;
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
        return res.status(422).json({ error: 'A valid email is required' });
    }
    if (!current_password) {
        return res.status(422).json({ error: 'Current password is required' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (!(await bcrypt.compare(current_password, user.password))) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const nextEmail = email.trim().toLowerCase();
        if (nextEmail !== user.email) {
            const taken = await User.findOne({ email: nextEmail });
            if (taken) {
                return res.status(409).json({ error: 'That email is already in use' });
            }
            user.email = nextEmail;
            await user.save();
        }
        res.json({ email: user.email });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/me/password — change password (requires current password)
router.patch('/password', authMiddleware, async (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
        return res.status(422).json({ error: 'Current and new passwords are required' });
    }
    if (typeof new_password !== 'string' || new_password.length < 6) {
        return res.status(422).json({ error: 'New password must be at least 6 characters' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (!(await bcrypt.compare(current_password, user.password))) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        user.password = await bcrypt.hash(new_password, 10);
        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/me/public-profile — opt in/out of the public adventurer page
router.patch('/public-profile', authMiddleware, async (req, res) => {
    const { public_profile } = req.body;
    if (typeof public_profile !== 'boolean') {
        return res.status(422).json({ error: 'public_profile must be a boolean' });
    }

    try {
        let user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (!user.handle) {
            user.handle = await generateHandle(user.email);
        }
        user.public_profile = public_profile;
        await user.save();

        res.json({ handle: user.handle, public_profile: user.public_profile });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/me — permanently delete the account and all owned data
router.delete('/', authMiddleware, async (req, res) => {
    const { current_password } = req.body;
    if (!current_password) {
        return res.status(422).json({ error: 'Current password is required to delete your account' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (!(await bcrypt.compare(current_password, user.password))) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Cascade: gallery clones are independent copies, so other users are unaffected.
        await Promise.all([
            Project.deleteMany({ userId: user._id }),
            Review.deleteMany({ userId: user._id }),
            XpEvent.deleteMany({ userId: user._id })
        ]);
        await User.findByIdAndDelete(user._id);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
