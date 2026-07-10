const crypto = require('crypto');
const User = require('../models/User');

/** Derives a public handle from an email's local part, disambiguating on collision. */
async function generateHandle(email) {
    const base = (email || '').split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 20) || 'adventurer';

    let candidate = base;
    let attempts = 0;
    while (await User.findOne({ handle: candidate })) {
        attempts += 1;
        candidate = `${base}-${crypto.randomBytes(2).toString('hex')}`;
        if (attempts > 5) break; // collision this persistent is effectively impossible
    }
    return candidate;
}

module.exports = { generateHandle };
