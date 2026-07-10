/**
 * Static achievement catalog. Each check(ctx) receives
 * { projects, reviews, events } for one user and returns a boolean.
 * Unlocks are recorded as XpEvents (type 'achievement'), so they are
 * one-shot by the same unique-key rule as all other XP.
 */

function hasEventStreak(events, days) {
    const dates = new Set(
        events.map(e => new Date(e.createdAt).toISOString().slice(0, 10))
    );
    for (const date of dates) {
        let run = 1;
        let cursor = new Date(date + 'T00:00:00Z');
        while (run < days) {
            cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
            if (!dates.has(cursor.toISOString().slice(0, 10))) break;
            run += 1;
        }
        if (run >= days) return true;
    }
    return false;
}

const ACHIEVEMENTS = [
    {
        id: 'first_quest',
        name: 'First Steps',
        icon: '🗡',
        description: 'Accept your first quest.',
        check: ({ projects }) => projects.length >= 1,
    },
    {
        id: 'five_quests',
        name: 'Guild Regular',
        icon: '📜',
        description: 'Accept five quests.',
        check: ({ projects }) => projects.length >= 5,
    },
    {
        id: 'quest_complete',
        name: 'Stage Master',
        icon: '⚑',
        description: 'Clear every stage of a quest.',
        check: ({ projects }) => projects.some(p =>
            (p.milestones?.length || 0) > 0 &&
            (p.completed_milestones?.length || 0) >= p.milestones.length
        ),
    },
    {
        id: 'first_turn_in',
        name: 'Proof of Work',
        icon: '🔍',
        description: 'Turn in a quest for guild inspection.',
        check: ({ reviews }) => reviews.some(r => r.kind === 'turn_in'),
    },
    {
        id: 'verified_hero',
        name: 'Verified Hero',
        icon: '🏆',
        description: 'Get a quest verified as complete.',
        check: ({ projects }) => projects.some(p => p.turn_in?.verdict === 'complete'),
    },
    {
        id: 'sharp_eye',
        name: 'Sharp Eye',
        icon: '💎',
        description: 'Inspect a repo that scores 8+ on hiring signal.',
        check: ({ reviews }) => reviews.some(r =>
            (r.scores?.hiring_signal?.score || 0) >= 8
        ),
    },
    {
        id: 'influencer',
        name: 'Influencer',
        icon: '📣',
        description: 'Have a published quest accepted by three adventurers.',
        check: ({ projects }) => projects.some(p => (p.accepted_count || 0) >= 3),
    },
    {
        id: 'streak_3',
        name: 'On a Roll',
        icon: '🔥',
        description: 'Earn XP on three consecutive days.',
        check: ({ events }) => hasEventStreak(
            events.filter(e => (e.amount || 0) > 0), 3
        ),
    },
];

module.exports = ACHIEVEMENTS;
