const mongoose = require('mongoose');

const categoryScoreSchema = {
    score: Number,
    rationale: String
};

const reviewSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    repo_url: String,
    repo: String,
    mode: String, // 'llm' or 'heuristic'
    scores: {
        architecture_clarity: categoryScoreSchema,
        test_coverage_signal: categoryScoreSchema,
        documentation_quality: categoryScoreSchema,
        hiring_signal: categoryScoreSchema
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', reviewSchema);
