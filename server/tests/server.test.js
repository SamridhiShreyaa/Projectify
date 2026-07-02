/**
 * Tests for Projectify Node.js Server
 *
 * Run with: npm test
 *
 * Covers:
 * - POST /api/auth/signup
 * - POST /api/auth/login
 * - POST /api/generate (auth, validation, rate limit, AI service errors)
 * - GET  /api/projects
 * - DELETE /api/projects/:id
 * - Auth middleware
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// ── App & model imports ──────────────────────────────────────────────────────
// Adjust path if your entry point is named differently
const app = require('../index');
const User = require('../models/User');
const Project = require('../models/Project');

// ── Test DB ──────────────────────────────────────────────────────────────────
// Uses a separate in-memory MongoDB so tests never touch your real DB.
// Requires: npm install --save-dev @jest/globals mongodb-memory-server supertest

const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.AI_SERVICE_URL = 'http://localhost:8001'; // will be mocked
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    jest.clearAllTimers();
});

afterEach(async () => {
    // Clean up between tests
    await User.deleteMany({});
    await Project.deleteMany({});
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createUser(email = 'test@example.com', password = 'password123') {
    const hashed = await bcrypt.hash(password, 10);
    return User.create({ email, password: hashed });
}

function makeToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

async function createUserAndToken(email = 'test@example.com') {
    const user = await createUser(email);
    const token = makeToken(user._id);
    return { user, token };
}

const VALID_GENERATE_PAYLOAD = {
    topic: 'web development',
    difficulty: 'beginner',
    stack: 'React, Node.js',
    hours_per_week: 10,
};

const MOCK_AI_RESPONSE = {
    title: 'Test Project',
    description: 'A test project.',
    core_features: ['Auth', 'CRUD'],
    stretch_goals: ['Dark mode'],
    milestones: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    file_structure: 'src/\n  index.js',
    learning_outcomes: ['REST APIs', 'Auth', 'MongoDB', 'Testing'],
    resources: ['MDN — https://developer.mozilla.org'],
    scope_notes: 'Scope looks appropriate.',
    skeleton_files: [
        { path: 'src/index.js', content: '// entry point\n' },
        { path: 'src/routes/items.js', content: '// routes stub\n' },
    ],
};


// ═════════════════════════════════════════════
// CORS
// ═════════════════════════════════════════════

describe('CORS allowlist', () => {
    it('sets Access-Control-Allow-Origin for the default allowed origin', async () => {
        const res = await request(app)
            .get('/health')
            .set('Origin', 'http://localhost:3000');
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('does not set Access-Control-Allow-Origin for a disallowed origin', async () => {
        const res = await request(app)
            .get('/health')
            .set('Origin', 'https://evil.example.com');
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('still serves requests without an Origin header', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });
});


// ═════════════════════════════════════════════
// Security headers (helmet)
// ═════════════════════════════════════════════

describe('helmet security headers', () => {
    it('sets standard security headers on responses', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBeDefined();
        expect(res.headers['content-security-policy']).toBeDefined();
        expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('does not interfere with CORS headers for allowed origins', async () => {
        const res = await request(app)
            .get('/health')
            .set('Origin', 'http://localhost:3000');
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
});


// ═════════════════════════════════════════════
// Auth — Signup
// ═════════════════════════════════════════════

describe('POST /api/auth/signup', () => {
    it('returns 200 and a token for valid input', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ email: 'new@example.com', password: 'password123' });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    it('returns the email in the response', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ email: 'new@example.com', password: 'password123' });
        expect(res.body.email).toBe('new@example.com');
    });

    it('returns 400 if email already exists', async () => {
        await createUser('dup@example.com');
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ email: 'dup@example.com', password: 'password123' });
        expect(res.status).toBe(400);
    });

    it('returns 400 if email is missing', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ password: 'password123' });
        expect(res.status).toBe(400);
    });

    it('returns 400 if password is missing', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ email: 'new@example.com' });
        expect(res.status).toBe(400);
    });

    it('returns 400 if password is under 6 characters', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ email: 'new@example.com', password: '12345' });
        expect(res.status).toBe(400);
    });

    it('does not store plaintext password', async () => {
        await request(app)
            .post('/api/auth/signup')
            .send({ email: 'new@example.com', password: 'plaintext' });
        const user = await User.findOne({ email: 'new@example.com' });
        expect(user.password).not.toBe('plaintext');
    });
});


// ═════════════════════════════════════════════
// Auth — Login
// ═════════════════════════════════════════════

describe('POST /api/auth/login', () => {
    beforeEach(async () => {
        await createUser('test@example.com', 'password123');
    });

    it('returns 200 and a token for valid credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: 'password123' });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    it('returns 401 for wrong password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: 'wrongpassword' });
        expect(res.status).toBe(401);
    });

    it('returns 401 for non-existent email', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@example.com', password: 'password123' });
        expect(res.status).toBe(401);
    });

    it('returns 400 if email is missing', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ password: 'password123' });
        expect(res.status).toBe(400);
    });

    it('returns 400 if password is missing', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com' });
        expect(res.status).toBe(400);
    });

    it('token is a valid JWT', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: 'password123' });
        const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
        expect(decoded.id).toBeDefined();
    });
});


// ═════════════════════════════════════════════
// Generate — Auth guard
// ═════════════════════════════════════════════

describe('POST /api/generate — auth', () => {
    it('returns 401 if no token provided', async () => {
        const res = await request(app)
            .post('/api/generate')
            .send(VALID_GENERATE_PAYLOAD);
        expect(res.status).toBe(401);
    });

    it('returns 401 if token is invalid', async () => {
        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', 'Bearer not-a-real-token')
            .send(VALID_GENERATE_PAYLOAD);
        expect(res.status).toBe(401);
    });

    it('returns 401 if token is expired', async () => {
        const expired = jwt.sign({ id: 'abc' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${expired}`)
            .send(VALID_GENERATE_PAYLOAD);
        expect(res.status).toBe(401);
    });
});


// ═════════════════════════════════════════════
// Generate — Input validation
// ═════════════════════════════════════════════

describe('POST /api/generate — validation', () => {
    let token;

    beforeEach(async () => {
        const result = await createUserAndToken();
        token = result.token;
    });

    const cases = [
        ['topic missing',           { ...VALID_GENERATE_PAYLOAD, topic: undefined }],
        ['topic too short',         { ...VALID_GENERATE_PAYLOAD, topic: 'ab' }],
        ['topic too long',          { ...VALID_GENERATE_PAYLOAD, topic: 'x'.repeat(201) }],
        ['invalid difficulty',      { ...VALID_GENERATE_PAYLOAD, difficulty: 'expert' }],
        ['difficulty missing',      { ...VALID_GENERATE_PAYLOAD, difficulty: undefined }],
        ['stack missing',           { ...VALID_GENERATE_PAYLOAD, stack: undefined }],
        ['stack too short',         { ...VALID_GENERATE_PAYLOAD, stack: 'x' }],
        ['hours zero',              { ...VALID_GENERATE_PAYLOAD, hours_per_week: 0 }],
        ['hours above 80',          { ...VALID_GENERATE_PAYLOAD, hours_per_week: 81 }],
        ['hours negative',          { ...VALID_GENERATE_PAYLOAD, hours_per_week: -1 }],
        ['hours not a number',      { ...VALID_GENERATE_PAYLOAD, hours_per_week: 'many' }],
    ];

    test.each(cases)('returns 422 when %s', async (_, payload) => {
        const clean = Object.fromEntries(
            Object.entries(payload).filter(([, v]) => v !== undefined)
        );
        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(clean);
        expect(res.status).toBe(422);
    });
});


// ═════════════════════════════════════════════
// Generate — Happy path (AI service mocked)
// ═════════════════════════════════════════════

describe('POST /api/generate — success', () => {
    let token;

    beforeEach(async () => {
        const result = await createUserAndToken();
        token = result.token;
    });

    it('returns 200 and saves the project', async () => {
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_AI_RESPONSE });

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Test Project');
    });

    it('saves project to database', async () => {
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_AI_RESPONSE });

        await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        const count = await Project.countDocuments({});
        expect(count).toBe(1);
    });

    it('persists skeleton_files on the saved project', async () => {
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_AI_RESPONSE });

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        expect(res.body.skeleton_files).toHaveLength(2);

        const project = await Project.findOne({});
        expect(project.skeleton_files).toHaveLength(2);
        expect(project.skeleton_files[0].path).toBe('src/index.js');
        expect(project.skeleton_files[0].content).toBe('// entry point\n');
    });

    it('project is saved with correct userId', async () => {
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_AI_RESPONSE });

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        const project = await Project.findOne({});
        expect(project.userId.toString()).toBe(res.body.userId.toString());
    });
});


// ═════════════════════════════════════════════
// Generate — AI service error handling
// ═════════════════════════════════════════════

describe('POST /api/generate — AI service errors', () => {
    let token;

    beforeEach(async () => {
        const result = await createUserAndToken();
        token = result.token;
    });

    it('returns 503 when AI service is down (ECONNREFUSED)', async () => {
        const axios = require('axios');
        const err = new Error('connect ECONNREFUSED');
        err.code = 'ECONNREFUSED';
        axios.post = jest.fn().mockRejectedValueOnce(err);

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        expect(res.status).toBe(503);
    });

    it('returns 504 when AI service times out', async () => {
        const axios = require('axios');
        const err = new Error('timeout of 30000ms exceeded');
        err.code = 'ECONNABORTED';
        axios.post = jest.fn().mockRejectedValueOnce(err);

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        expect(res.status).toBe(504);
    });

    it('returns 429 when AI service rate limits', async () => {
        const axios = require('axios');
        const err = new Error('Too many requests');
        err.response = { status: 429, data: { detail: 'Too many requests' } };
        axios.post = jest.fn().mockRejectedValueOnce(err);

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        expect(res.status).toBe(429);
    });
});


// ═════════════════════════════════════════════
// Generate — Rate limiting
// ═════════════════════════════════════════════

describe('POST /api/generate — rate limiting', () => {
    it('blocks after 5 requests from the same user', async () => {
        const { token } = await createUserAndToken();
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValue({ data: MOCK_AI_RESPONSE });

        let lastRes;
        for (let i = 0; i < 6; i++) {
            lastRes = await request(app)
                .post('/api/generate')
                .set('Authorization', `Bearer ${token}`)
                .send(VALID_GENERATE_PAYLOAD);
        }

        expect(lastRes.status).toBe(429);
    });
});


// ═════════════════════════════════════════════
// Review — POST /api/review
// ═════════════════════════════════════════════

const MOCK_REVIEW_RESPONSE = {
    repo: 'someone/goodrepo',
    mode: 'heuristic',
    scores: {
        architecture_clarity: { score: 7, rationale: 'Clear module layout.' },
        test_coverage_signal: { score: 6, rationale: 'Has a tests directory.' },
        documentation_quality: { score: 8, rationale: 'Thorough README.' },
        hiring_signal: { score: 7, rationale: 'Solid portfolio piece.' },
    },
};

describe('POST /api/review', () => {
    it('returns 401 if no token provided', async () => {
        const res = await request(app)
            .post('/api/review')
            .send({ repo_url: 'https://github.com/someone/goodrepo' });
        expect(res.status).toBe(401);
    });

    it('returns 401 if token is invalid', async () => {
        const res = await request(app)
            .post('/api/review')
            .set('Authorization', 'Bearer not-a-real-token')
            .send({ repo_url: 'https://github.com/someone/goodrepo' });
        expect(res.status).toBe(401);
    });

    it('returns 422 if repo_url is missing', async () => {
        const { token } = await createUserAndToken();
        const res = await request(app)
            .post('/api/review')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(res.status).toBe(422);
    });

    it('proxies to the AI service and persists the review per user', async () => {
        const Review = require('../models/Review');
        const { user, token } = await createUserAndToken();
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_REVIEW_RESPONSE });

        const res = await request(app)
            .post('/api/review')
            .set('Authorization', `Bearer ${token}`)
            .send({ repo_url: 'https://github.com/someone/goodrepo' });

        expect(res.status).toBe(200);
        expect(res.body.scores.hiring_signal.score).toBe(7);

        const saved = await Review.findOne({});
        expect(saved.userId.toString()).toBe(user._id.toString());
        expect(saved.repo).toBe('someone/goodrepo');
        expect(saved.mode).toBe('heuristic');

        await Review.deleteMany({});
    });

    it('maps AI-service 404 to 404 (repo not found)', async () => {
        const { token } = await createUserAndToken();
        const axios = require('axios');
        const err = new Error('not found');
        err.response = { status: 404, data: { detail: 'Repository not found' } };
        axios.post = jest.fn().mockRejectedValueOnce(err);

        const res = await request(app)
            .post('/api/review')
            .set('Authorization', `Bearer ${token}`)
            .send({ repo_url: 'https://github.com/nobody/ghost' });

        expect(res.status).toBe(404);
    });
});


// ═════════════════════════════════════════════
// Projects — GET
// ═════════════════════════════════════════════

describe('GET /api/projects', () => {
    it('returns 401 without token', async () => {
        const res = await request(app).get('/api/projects');
        expect(res.status).toBe(401);
    });

    it('returns empty array when user has no projects', async () => {
        const { token } = await createUserAndToken();
        const res = await request(app)
            .get('/api/projects')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('returns only the logged-in user\'s projects', async () => {
        const { user: user1, token: token1 } = await createUserAndToken();
        const user2 = await createUser('other@example.com');

        await Project.create({ userId: user1._id, ...MOCK_AI_RESPONSE, input: VALID_GENERATE_PAYLOAD });
        await Project.create({ userId: user2._id, ...MOCK_AI_RESPONSE, input: VALID_GENERATE_PAYLOAD });

        const res = await request(app)
            .get('/api/projects')
            .set('Authorization', `Bearer ${token1}`);

        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        expect(res.body[0].userId.toString()).toBe(user1._id.toString());
    });

    it('returns projects sorted newest first', async () => {
        const { user, token } = await createUserAndToken();

        const p1 = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, title: 'Old', input: VALID_GENERATE_PAYLOAD });
        await new Promise(r => setTimeout(r, 10));
        const p2 = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, title: 'New', input: VALID_GENERATE_PAYLOAD });

        const res = await request(app)
            .get('/api/projects')
            .set('Authorization', `Bearer ${token}`);

        expect(res.body[0].title).toBe('New');
        expect(res.body[1].title).toBe('Old');
    });
});


// ═════════════════════════════════════════════
// Projects — DELETE
// ═════════════════════════════════════════════

describe('DELETE /api/projects/:id', () => {
    it('returns 401 without token', async () => {
        const res = await request(app).delete('/api/projects/someId');
        expect(res.status).toBe(401);
    });

    it('deletes own project successfully', async () => {
        const { user, token } = await createUserAndToken();
        const project = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, input: VALID_GENERATE_PAYLOAD });

        const res = await request(app)
            .delete(`/api/projects/${project._id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('removes the project from the database', async () => {
        const { user, token } = await createUserAndToken();
        const project = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, input: VALID_GENERATE_PAYLOAD });

        await request(app)
            .delete(`/api/projects/${project._id}`)
            .set('Authorization', `Bearer ${token}`);

        const found = await Project.findById(project._id);
        expect(found).toBeNull();
    });

    it('returns 404 when trying to delete another user\'s project', async () => {
        const user2 = await createUser('other@example.com');
        const { token: token1 } = await createUserAndToken();
        const project = await Project.create({ userId: user2._id, ...MOCK_AI_RESPONSE, input: VALID_GENERATE_PAYLOAD });

        const res = await request(app)
            .delete(`/api/projects/${project._id}`)
            .set('Authorization', `Bearer ${token1}`);

        expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent project ID', async () => {
        const { token } = await createUserAndToken();
        const fakeId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .delete(`/api/projects/${fakeId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
    });
});