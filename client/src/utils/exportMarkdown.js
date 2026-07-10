// Builds a README.md from a generated project brief, and the filename slug
// shared with the starter-zip download.

export function slugify(title) {
    return (title || 'project')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function buildMarkdown(project) {
    const done = new Set(project.completed_milestones || []);
    const lines = [`# ${project.title || 'Untitled Project'}`, ''];

    if (project.description) {
        lines.push(project.description, '');
    }

    if (project.core_features?.length) {
        lines.push('## Core Features', '');
        project.core_features.forEach(f => lines.push(`- ${f}`));
        lines.push('');
    }

    if (project.stretch_goals?.length) {
        lines.push('## Stretch Goals', '');
        project.stretch_goals.forEach(g => lines.push(`- ${g}`));
        lines.push('');
    }

    if (project.milestones?.length) {
        lines.push('## Milestones', '');
        project.milestones.forEach((m, i) => lines.push(`- [${done.has(i) ? 'x' : ' '}] ${m}`));
        lines.push('');
    }

    if (project.mermaid_diagram) {
        lines.push('## Architecture', '', '```mermaid', project.mermaid_diagram, '```', '');
    }

    if (project.file_structure) {
        lines.push('## File Structure', '', '```', project.file_structure, '```', '');
    }

    if (project.learning_outcomes?.length) {
        lines.push('## Learning Outcomes', '');
        project.learning_outcomes.forEach(o => lines.push(`- ${o}`));
        lines.push('');
    }

    if (project.resources?.length) {
        lines.push('## Resources', '');
        project.resources.forEach(r => lines.push(`- ${r}`));
        lines.push('');
    }

    lines.push('---', '', '_Generated with [Projectify](https://github.com/SamridhiShreyaa/Projectify)_', '');
    return lines.join('\n');
}
