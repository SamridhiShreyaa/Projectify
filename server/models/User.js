const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // Display name shown across the app; defaults to the email localpart at signup
    name: { type: String },
    // Public identifier for the opt-in adventurer profile — never the email.
    // Sparse so legacy users (created before this field existed) don't
    // collide on `null`; backfilled lazily on first GET /api/me.
    handle: { type: String, unique: true, sparse: true },
    public_profile: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
