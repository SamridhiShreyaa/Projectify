// Display mirror of the XP/level model. The server (server/config/xp.js) is
// the authoritative source — persisted XP comes from GET /api/stats. These
// constants exist only so Result/ProjectCard can show an instant "+XP" banner
// before the server round-trip, and must be kept in sync with server/config/xp.js.

export const DIFFICULTY_XP = { beginner: 30, intermediate: 60, advanced: 100 };
export const MILESTONE_XP = 10;
export const XP_PER_LEVEL = 250;

export function projectXP(project) {
    const base = DIFFICULTY_XP[project.input?.difficulty] || 50;
    const milestones = (project.completed_milestones || []).length;
    return base + milestones * MILESTONE_XP;
}

export function totalXP(projects) {
    return projects.reduce((sum, p) => sum + projectXP(p), 0);
}

export function levelFor(xp) {
    return 1 + Math.floor(xp / XP_PER_LEVEL);
}

export function xpIntoLevel(xp) {
    return xp % XP_PER_LEVEL;
}
