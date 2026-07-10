/**
 * XP awarding, lazy backfill, achievement evaluation, and stats aggregation.
 * All awards flow through awardXp(), whose unique-key insert makes every
 * reward idempotent (see models/XpEvent.js).
 */

const XpEvent = require('../models/XpEvent');
const Project = require('../models/Project');
const Review = require('../models/Review');
const ACHIEVEMENTS = require('../config/achievements');
const {
    DIFFICULTY_XP,
    MILESTONE_XP,
    XP_PER_LEVEL,
    TURN_IN_TIER_XP,
    TURN_IN_TIER_ORDER,
    FIRST_REVIEW_XP,
    ACHIEVEMENT_XP,
    AUTHOR_ACCEPT_XP,
} = require('../config/xp');

async function awardXp({ userId, key, type, amount, projectId, reviewId, meta }) {
    try {
        return await XpEvent.create({ userId, key, type, amount, projectId, reviewId, meta });
    } catch (e) {
        if (e.code === 11000) return null; // already awarded — idempotent no-op
        throw e;
    }
}

async function awardQuestAccept(userId, project) {
    const difficulty = project.input?.difficulty;
    return awardXp({
        userId,
        key: `${userId}:quest_accept:${project._id}`,
        type: 'quest_accept',
        amount: DIFFICULTY_XP[difficulty] || DIFFICULTY_XP.beginner,
        projectId: project._id,
        meta: { difficulty },
    });
}

async function awardMilestones(userId, projectId, indices) {
    let total = 0;
    for (const index of indices) {
        const event = await awardXp({
            userId,
            key: `${userId}:milestone:${projectId}:${index}`,
            type: 'milestone',
            amount: MILESTONE_XP,
            projectId,
            meta: { index },
        });
        if (event) total += event.amount;
    }
    return total;
}

async function awardTurnInTiers(userId, projectId, verdict) {
    const reached = TURN_IN_TIER_ORDER.indexOf(verdict);
    let total = 0;
    for (const tier of TURN_IN_TIER_ORDER.slice(0, reached + 1)) {
        const event = await awardXp({
            userId,
            key: `${userId}:turn_in:${projectId}:${tier}`,
            type: 'turn_in',
            amount: TURN_IN_TIER_XP[tier],
            projectId,
            meta: { tier },
        });
        if (event) total += event.amount;
    }
    return total;
}

async function awardAuthorAccept(authorId, cloneId) {
    return awardXp({
        userId: authorId,
        key: `${authorId}:quest_authored:${cloneId}`,
        type: 'quest_authored',
        amount: AUTHOR_ACCEPT_XP,
        projectId: cloneId,
    });
}

async function awardFirstReview(userId, reviewId) {
    return awardXp({
        userId,
        key: `${userId}:first_review`,
        type: 'first_review',
        amount: FIRST_REVIEW_XP,
        reviewId,
    });
}

/**
 * One-time synthesis of XP events for data that predates the ledger.
 * Every synthesized event uses the same keys the live award paths use,
 * so repeated or concurrent backfills are harmless.
 */
async function ensureBackfill(userId) {
    const markerKey = `${userId}:backfill:v1`;
    if (await XpEvent.exists({ key: markerKey })) return;

    const projects = await Project.find({ userId });
    for (const project of projects) {
        await awardQuestAccept(userId, project);
        await awardMilestones(userId, project._id, project.completed_milestones || []);
        if (project.turn_in?.verdict) {
            await awardTurnInTiers(userId, project._id, project.turn_in.verdict);
        }
    }
    const firstReview = await Review.findOne({ userId }).sort({ createdAt: 1 });
    if (firstReview) {
        await awardFirstReview(userId, firstReview._id);
    }
    await awardXp({ userId, key: markerKey, type: 'backfill', amount: 0 });
}

/** Evaluate the catalog and award any newly earned achievements. */
async function evaluateAchievements(userId) {
    const [projects, reviews, events] = await Promise.all([
        Project.find({ userId }),
        Review.find({ userId }),
        XpEvent.find({ userId }),
    ]);
    const ctx = { projects, reviews, events };
    const unlocked = [];
    for (const achievement of ACHIEVEMENTS) {
        let earned = false;
        try {
            earned = achievement.check(ctx);
        } catch {
            continue; // a broken check must never take down an award path
        }
        if (!earned) continue;
        const event = await awardXp({
            userId,
            key: `${userId}:achievement:${achievement.id}`,
            type: 'achievement',
            amount: ACHIEVEMENT_XP,
            meta: { achievementId: achievement.id },
        });
        if (event) unlocked.push(achievement.id);
    }
    return unlocked;
}

async function computeStats(userId) {
    const [events, projects, reviews] = await Promise.all([
        XpEvent.find({ userId }).sort({ createdAt: -1 }),
        Project.find({ userId }),
        Review.find({ userId }),
    ]);

    const total_xp = events.reduce((sum, e) => sum + (e.amount || 0), 0);
    const level = 1 + Math.floor(total_xp / XP_PER_LEVEL);

    const unlockedAt = new Map(
        events
            .filter(e => e.type === 'achievement')
            .map(e => [e.meta?.achievementId, e.createdAt])
    );

    return {
        total_xp,
        level,
        xp_into_level: total_xp % XP_PER_LEVEL,
        xp_per_level: XP_PER_LEVEL,
        counts: {
            quests: projects.length,
            quests_completed: projects.filter(p =>
                (p.milestones?.length || 0) > 0 &&
                (p.completed_milestones?.length || 0) >= p.milestones.length
            ).length,
            stages_cleared: projects.reduce(
                (sum, p) => sum + (p.completed_milestones?.length || 0), 0
            ),
            reviews: reviews.filter(r => r.kind !== 'turn_in').length,
            turn_ins: reviews.filter(r => r.kind === 'turn_in').length,
        },
        achievements: ACHIEVEMENTS.map(a => ({
            id: a.id,
            name: a.name,
            icon: a.icon,
            description: a.description,
            unlocked: unlockedAt.has(a.id),
            unlockedAt: unlockedAt.get(a.id) || null,
        })),
        recent_events: events.slice(0, 10).map(e => ({
            type: e.type,
            amount: e.amount,
            meta: e.meta || {},
            createdAt: e.createdAt,
        })),
    };
}

module.exports = {
    awardXp,
    awardQuestAccept,
    awardMilestones,
    awardTurnInTiers,
    awardAuthorAccept,
    awardFirstReview,
    ensureBackfill,
    evaluateAchievements,
    computeStats,
};
