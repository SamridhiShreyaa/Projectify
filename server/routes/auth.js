const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateHandle } = require('../utils/handle');

router.post('/signup', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const handle = await generateHandle(email);
        const name = (typeof req.body.name === 'string' && req.body.name.trim())
            ? req.body.name.trim().slice(0, 50)
            : email.split('@')[0];
        const user = await User.create({ email, password: hashed, handle, name });
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, email: user.email, name: user.name });
    } catch (e) {
        console.error('Signup error:', e);
        res.status(400).json({ error: 'Registration failed. Please try again.' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, email: user.email, name: user.name || user.email.split('@')[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
