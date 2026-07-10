/**
 * XP model — the server is the single source of truth for these numbers.
 * client/src/utils/xp.js mirrors them for instant display only.
 *
 * Anti-farming notes: every award writes an XpEvent with a unique `key`
 * (see utils/xp.js), so re-doing an action never double-awards. Deleting a
 * project and regenerating a similar one DOES yield fresh quest_accept XP
 * (new projectId → new key); that's accepted and bounded by the 5/min
 * generate rate limit.
 */

const DIFFICULTY_XP = { beginner: 30, intermediate: 60, advanced: 100 };
const MILESTONE_XP = 10;
const XP_PER_LEVEL = 250;

// Cumulative one-shot tier bonuses for quest turn-ins: reaching "complete"
// on the first try awards all three (25+50+75); improving a previous
// "partial" run to "substantial" awards only the new tier's 50.
const TURN_IN_TIER_XP = { partial: 25, substantial: 50, complete: 75 };
const TURN_IN_TIER_ORDER = ['partial', 'substantial', 'complete'];

const FIRST_REVIEW_XP = 20;
const ACHIEVEMENT_XP = 40;

// Awarded to a quest's author each time another adventurer accepts it from
// the Quest Board. Keyed by the new clone's id, so it can't be re-farmed by
// deleting and re-accepting the same clone (a fresh clone is a fresh accept).
const AUTHOR_ACCEPT_XP = 15;

module.exports = {
    DIFFICULTY_XP,
    MILESTONE_XP,
    XP_PER_LEVEL,
    TURN_IN_TIER_XP,
    TURN_IN_TIER_ORDER,
    FIRST_REVIEW_XP,
    ACHIEVEMENT_XP,
    AUTHOR_ACCEPT_XP,
};
