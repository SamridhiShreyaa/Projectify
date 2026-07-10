const mongoose = require('mongoose');

/**
 * Append-only XP ledger. `key` is globally unique and embeds the userId plus
 * what was rewarded (e.g. "<userId>:milestone:<projectId>:2"), so the unique
 * index makes every award idempotent and race-proof — a duplicate create
 * fails with E11000 and is treated as "already awarded".
 */
const xpEventSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    key: { type: String, unique: true },
    type: String, // quest_accept | milestone | turn_in | first_review | achievement | backfill
    amount: Number,
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' },
    meta: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('XpEvent', xpEventSchema);
