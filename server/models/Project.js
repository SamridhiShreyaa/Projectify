const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    description: String,
    core_features: [String],
    stretch_goals: [String],
    file_structure: String,
    milestones: [String],
    learning_outcomes: [String],
    resources: [String],
    skeleton_files: {
        type: [{ path: String, content: String, _id: false }],
        default: []
    },
    mermaid_diagram: String,
    input: {
        topic: String,
        difficulty: String,
        stack: String,
        hours_per_week: Number
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Project', projectSchema);
