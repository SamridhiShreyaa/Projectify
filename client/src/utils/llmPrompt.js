// Builds a structured, copy-paste-able prompt a user can hand to any LLM
// (ChatGPT, Claude, etc.) to get guided help building a project.
//
// Deterministic and tolerant: works from a lightweight idea (title,
// description, features) OR a full brief (which also has milestones/stack),
// so the same function powers both the option cards and the final quest brief.

export function buildLlmPrompt(p = {}) {
    const stack = (p.input?.stack || p.stack || '').trim();
    const difficulty = (p.input?.difficulty || p.difficulty || '').trim();
    const hours = p.input?.hours_per_week || p.hours_per_week;
    const features = (p.core_features || []).filter(Boolean);
    const stretch = (p.stretch_goals || []).filter(Boolean);
    const milestones = (p.milestones || []).filter(Boolean);

    const L = [];
    L.push("I'm building a software project and I'd like your help as a senior engineering mentor.");
    L.push('');
    L.push(`PROJECT: ${p.title || 'Untitled project'}`);
    if (p.description) L.push(p.description);
    L.push('');

    const meta = [];
    if (stack) meta.push(`Tech stack: ${stack}`);
    if (difficulty) meta.push(`Level: ${difficulty}`);
    if (hours) meta.push(`Time budget: ${hours} hours/week`);
    if (meta.length) {
        L.push(meta.join('  |  '));
        L.push('');
    }

    if (features.length) {
        L.push('CORE FEATURES:');
        features.forEach(f => L.push(`- ${f}`));
        L.push('');
    }
    if (stretch.length) {
        L.push('STRETCH GOALS:');
        stretch.forEach(s => L.push(`- ${s}`));
        L.push('');
    }
    if (milestones.length) {
        L.push('MILESTONES:');
        milestones.forEach((m, i) => L.push(`${i + 1}. ${m}`));
        L.push('');
    }

    L.push('Please help me build this step by step:');
    L.push(`1. Recommend a project structure and tooling for ${stack || 'this stack'}.`);
    L.push(milestones.length
        ? '2. Break milestone 1 into concrete, ordered coding tasks.'
        : '2. Break the first core feature into concrete, ordered coding tasks.');
    L.push('3. For each task, explain the approach before giving code, and flag common pitfalls.');
    L.push('4. Suggest how to test each feature as I go.');
    L.push('');
    L.push('Start by asking me any clarifying questions, then propose a build plan I can follow.');

    return L.join('\n');
}
