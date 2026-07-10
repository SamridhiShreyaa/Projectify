const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Generation is asynchronous — 'pending' until the AI service responds,
    // then 'complete' (brief fields populated) or 'failed' (generation_error
    // set). Every other creation path (accept-clone, legacy rows) is already
    // a finished brief, hence the 'complete' default.
    status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'complete' },
    generation_error: String,
    title: String,
    description: String,
    core_features: [String],
    stretch_goals: [String],
    scope_notes: String,
    file_structure: String,
    milestones: [String],
    learning_outcomes: [String],
    resources: [String],
    skeleton_files: {
        type: [{ path: String, content: String, _id: false }],
        default: []
    },
    mermaid_diagram: String,
    completed_milestones: { type: [Number], default: [] },
    // Optional per-stage target dates ("YYYY-MM-DD" or ""), index-aligned with
    // milestones; absent entirely until the user first sets a date
    milestone_dates: { type: [String], default: undefined },
    share_token: { type: String, index: true, sparse: true },
    repo_url: String,
    // Latest turn-in verdict snapshot (absent until the quest is first turned in);
    // the full history lives on Review docs with kind 'turn_in'
    turn_in: {
        type: {
            percent: Number,
            verdict: String, // complete | substantial | partial | not_started
            summary: String,
            mode: String, // llm | heuristic
            features: [{ feature: String, verdict: String, evidence: String, _id: false }],
            milestones: [{ milestone: String, verdict: String, evidence: String, _id: false }],
            stack_match: { verdict: String, rationale: String },
            reviewId: mongoose.Schema.Types.ObjectId,
            verified_at: Date
        },
        default: undefined
    },
    // Quest Board (public gallery) — opt-in, independent of unlisted share links
    published: { type: Boolean, default: false, index: true },
    published_at: Date,
    accepted_count: { type: Number, default: 0 },
    // Provenance when this quest was forged from a repo review
    sourceReviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', default: undefined },
    source_repo: String, // denormalized "owner/repo" for display without a join
    // Provenance when a quest was cloned from the gallery
    origin: {
        type: {
            kind: String, // 'gallery'
            sourceProjectId: mongoose.Schema.Types.ObjectId
        },
        default: undefined
    },
    input: {
        topic: String,
        difficulty: String,
        stack: String,
        hours_per_week: Number
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Project', projectSchema);
