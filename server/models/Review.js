const mongoose = require('mongoose');

const categoryScoreSchema = {
    score: Number,
    rationale: String
};

const reviewSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // 'inspection' = standalone repo review; 'turn_in' = verification against a
    // quest brief. Old docs lack the field — treat missing as 'inspection'.
    kind: { type: String, default: 'inspection' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true, sparse: true },
    repo_url: String,
    repo: String,
    mode: String, // 'llm' or 'heuristic'
    language: String, // repo's primary language per GitHub metadata
    detected_stack: String, // richer stack string detected from languages + tree markers
    verification: mongoose.Schema.Types.Mixed, // VerifyOutput payload for turn_in reviews
    scores: {
        architecture_clarity: categoryScoreSchema,
        test_coverage_signal: categoryScoreSchema,
        documentation_quality: categoryScoreSchema,
        hiring_signal: categoryScoreSchema
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', reviewSchema);
