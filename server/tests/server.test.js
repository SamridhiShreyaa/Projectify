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
    // Let any in-flight background generation settle before wiping the DB, so
    // a straggling job doesn't error mid-write or bleed into the next test.
    await drainPendingGenerations();
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

// Generation runs in the background after the 202 response — mocked axios
// resolves near-instantly, so this settles within a few ticks in tests.
async function waitForStatus(projectId, timeoutMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const p = await Project.findById(projectId);
        if (p && p.status !== 'pending') return p;
        await new Promise(r => setTimeout(r, 10));
    }
    throw new Error('Timed out waiting for generation to settle');
}

// Waits until no background generation is still running, so a straggling
// job can't award XP (or mutate a project) during a later test. Call this
// before XpEvent cleanup in any suite that fires /api/generate.
async function drainPendingGenerations(timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await Project.countDocuments({ status: 'pending' }) === 0) return;
        await new Promise(r => setTimeout(r, 10));
    }
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

describe('POST /api/generate — success (async)', () => {
    const XpEvent = require('../models/XpEvent');
    let token, user;

    beforeEach(async () => {
        const result = await createUserAndToken();
        token = result.token;
        user = result.user;
    });

    afterEach(async () => {
        await drainPendingGenerations();
        await XpEvent.deleteMany({});
    });

    it('returns 202 immediately with a pending project', async () => {
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_AI_RESPONSE });

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        expect(res.status).toBe(202);
        expect(res.body.status).toBe('pending');
        expect(res.body._id).toBeDefined();
        expect(res.body.input.topic).toBe(VALID_GENERATE_PAYLOAD.topic);

        // Drain the background job before the test (and its afterEach) ends,
        // so a straggling XP award can't leak an XpEvent into the next test.
        await waitForStatus(res.body._id);
    });

    it('saves the project to the database immediately (as pending)', async () => {
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_AI_RESPONSE });

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        const count = await Project.countDocuments({});
        expect(count).toBe(1);
        await waitForStatus(res.body._id); // drain background job — see note above
    });

    it('completes in the background and populates the full brief', async () => {
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_AI_RESPONSE });

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        const project = await waitForStatus(res.body._id);
        expect(project.status).toBe('complete');
        expect(project.title).toBe('Test Project');
        expect(project.skeleton_files).toHaveLength(2);
        expect(project.skeleton_files[0].path).toBe('src/index.js');
        expect(project.userId.toString()).toBe(user._id.toString());
    });

    it('awards quest_accept XP only after the background generation completes', async () => {
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_AI_RESPONSE });

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        expect(await XpEvent.countDocuments({ type: 'quest_accept' })).toBe(0);
        await waitForStatus(res.body._id);
        expect(await XpEvent.countDocuments({ type: 'quest_accept' })).toBe(1);
    });
});


// ═════════════════════════════════════════════
// Generate — AI service error handling (async)
// ═════════════════════════════════════════════

describe('POST /api/generate — AI service errors (async)', () => {
    const XpEvent = require('../models/XpEvent');
    let token;

    beforeEach(async () => {
        const result = await createUserAndToken();
        token = result.token;
    });

    afterEach(async () => {
        await drainPendingGenerations();
        await XpEvent.deleteMany({});
    });

    it('still accepts synchronously, then marks the project failed on ECONNREFUSED', async () => {
        const axios = require('axios');
        const err = new Error('connect ECONNREFUSED');
        err.code = 'ECONNREFUSED';
        axios.post = jest.fn().mockRejectedValueOnce(err);

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        expect(res.status).toBe(202);
        const project = await waitForStatus(res.body._id);
        expect(project.status).toBe('failed');
        expect(project.generation_error).toMatch(/unavailable/i);
    });

    it('marks the project failed with a timeout message on ECONNABORTED', async () => {
        const axios = require('axios');
        const err = new Error('timeout of 30000ms exceeded');
        err.code = 'ECONNABORTED';
        axios.post = jest.fn().mockRejectedValueOnce(err);

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        const project = await waitForStatus(res.body._id);
        expect(project.status).toBe('failed');
        expect(project.generation_error).toMatch(/timed out/i);
    });

    it('marks the project failed when the AI service rate limits', async () => {
        const axios = require('axios');
        const err = new Error('Too many requests');
        err.response = { status: 429, data: { detail: 'Too many requests' } };
        axios.post = jest.fn().mockRejectedValueOnce(err);

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        const project = await waitForStatus(res.body._id);
        expect(project.status).toBe('failed');
        expect(project.generation_error).toMatch(/too many requests/i);
    });

    it('does not award quest_accept XP for a failed generation', async () => {
        const axios = require('axios');
        const err = new Error('connect ECONNREFUSED');
        err.code = 'ECONNREFUSED';
        axios.post = jest.fn().mockRejectedValueOnce(err);

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_GENERATE_PAYLOAD);

        await waitForStatus(res.body._id);
        expect(await XpEvent.countDocuments({ type: 'quest_accept' })).toBe(0);
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


// ═════════════════════════════════════════════
// Projects — GET by id
// ═════════════════════════════════════════════

describe('GET /api/projects/:id', () => {
    it('returns 401 without token', async () => {
        const res = await request(app).get('/api/projects/someId');
        expect(res.status).toBe(401);
    });

    it('returns own project with completed_milestones defaulting to []', async () => {
        const { user, token } = await createUserAndToken();
        const project = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, input: VALID_GENERATE_PAYLOAD });

        const res = await request(app)
            .get(`/api/projects/${project._id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Test Project');
        expect(res.body.completed_milestones).toEqual([]);
    });

    it("returns 404 for another user's project", async () => {
        const user2 = await createUser('other@example.com');
        const { token: token1 } = await createUserAndToken();
        const project = await Project.create({ userId: user2._id, ...MOCK_AI_RESPONSE, input: VALID_GENERATE_PAYLOAD });

        const res = await request(app)
            .get(`/api/projects/${project._id}`)
            .set('Authorization', `Bearer ${token1}`);

        expect(res.status).toBe(404);
    });

    it('returns 404 for a non-existent project id', async () => {
        const { token } = await createUserAndToken();
        const fakeId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .get(`/api/projects/${fakeId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
    });

    it('returns 404 for a malformed project id (CastError)', async () => {
        const { token } = await createUserAndToken();

        const res = await request(app)
            .get('/api/projects/not-a-valid-objectid')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
    });
});


// ═════════════════════════════════════════════
// Projects — PATCH progress
// ═════════════════════════════════════════════

describe('PATCH /api/projects/:id/progress', () => {
    async function createProjectAndToken() {
        const { user, token } = await createUserAndToken();
        const project = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, input: VALID_GENERATE_PAYLOAD });
        return { user, token, project };
    }

    it('returns 401 without token', async () => {
        const res = await request(app)
            .patch('/api/projects/someId/progress')
            .send({ completed_milestones: [0] });
        expect(res.status).toBe(401);
    });

    it('persists valid milestone indices', async () => {
        const { token, project } = await createProjectAndToken();

        const res = await request(app)
            .patch(`/api/projects/${project._id}/progress`)
            .set('Authorization', `Bearer ${token}`)
            .send({ completed_milestones: [0, 2] });

        expect(res.status).toBe(200);
        expect(res.body.completed_milestones).toEqual([0, 2]);

        const saved = await Project.findById(project._id);
        expect([...saved.completed_milestones]).toEqual([0, 2]);
    });

    it('dedupes repeated indices', async () => {
        const { token, project } = await createProjectAndToken();

        const res = await request(app)
            .patch(`/api/projects/${project._id}/progress`)
            .set('Authorization', `Bearer ${token}`)
            .send({ completed_milestones: [1, 1, 3, 3] });

        expect(res.status).toBe(200);
        expect(res.body.completed_milestones).toEqual([1, 3]);
    });

    it('returns 422 when body is not an array', async () => {
        const { token, project } = await createProjectAndToken();

        const res = await request(app)
            .patch(`/api/projects/${project._id}/progress`)
            .set('Authorization', `Bearer ${token}`)
            .send({ completed_milestones: 'all of them' });

        expect(res.status).toBe(422);
    });

    it('returns 422 for non-integer entries', async () => {
        const { token, project } = await createProjectAndToken();

        const res = await request(app)
            .patch(`/api/projects/${project._id}/progress`)
            .set('Authorization', `Bearer ${token}`)
            .send({ completed_milestones: [0.5] });

        expect(res.status).toBe(422);
    });

    it('returns 422 for out-of-bounds indices', async () => {
        const { token, project } = await createProjectAndToken();
        // MOCK_AI_RESPONSE has 4 milestones → valid indices 0-3

        const res = await request(app)
            .patch(`/api/projects/${project._id}/progress`)
            .set('Authorization', `Bearer ${token}`)
            .send({ completed_milestones: [4] });

        expect(res.status).toBe(422);
    });

    it('returns 422 for negative indices', async () => {
        const { token, project } = await createProjectAndToken();

        const res = await request(app)
            .patch(`/api/projects/${project._id}/progress`)
            .set('Authorization', `Bearer ${token}`)
            .send({ completed_milestones: [-1] });

        expect(res.status).toBe(422);
    });

    it("returns 404 for another user's project", async () => {
        const user2 = await createUser('other@example.com');
        const { token: token1 } = await createUserAndToken();
        const project = await Project.create({ userId: user2._id, ...MOCK_AI_RESPONSE, input: VALID_GENERATE_PAYLOAD });

        const res = await request(app)
            .patch(`/api/projects/${project._id}/progress`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ completed_milestones: [0] });

        expect(res.status).toBe(404);
    });
});


// ═════════════════════════════════════════════
// Projects — share tokens & public access
// ═════════════════════════════════════════════

describe('POST /api/projects/:id/share and GET /api/public/projects/:token', () => {
    async function createProjectAndToken() {
        const { user, token } = await createUserAndToken();
        const project = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, input: VALID_GENERATE_PAYLOAD });
        return { user, token, project };
    }

    it('share returns 401 without token', async () => {
        const res = await request(app).post('/api/projects/someId/share');
        expect(res.status).toBe(401);
    });

    it('creates a 64-hex-char share token', async () => {
        const { token, project } = await createProjectAndToken();

        const res = await request(app)
            .post(`/api/projects/${project._id}/share`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.share_token).toMatch(/^[0-9a-f]{64}$/);
        expect(res.body.share_url).toBe(`/share/${res.body.share_token}`);
    });

    it('is idempotent — second call returns the same token', async () => {
        const { token, project } = await createProjectAndToken();

        const first = await request(app)
            .post(`/api/projects/${project._id}/share`)
            .set('Authorization', `Bearer ${token}`);
        const second = await request(app)
            .post(`/api/projects/${project._id}/share`)
            .set('Authorization', `Bearer ${token}`);

        expect(second.body.share_token).toBe(first.body.share_token);
    });

    it("returns 404 sharing another user's project", async () => {
        const user2 = await createUser('other@example.com');
        const { token: token1 } = await createUserAndToken();
        const project = await Project.create({ userId: user2._id, ...MOCK_AI_RESPONSE, input: VALID_GENERATE_PAYLOAD });

        const res = await request(app)
            .post(`/api/projects/${project._id}/share`)
            .set('Authorization', `Bearer ${token1}`);

        expect(res.status).toBe(404);
    });

    it('public endpoint serves a shared project without auth, excluding userId and share_token', async () => {
        const { token, project } = await createProjectAndToken();
        const share = await request(app)
            .post(`/api/projects/${project._id}/share`)
            .set('Authorization', `Bearer ${token}`);

        const res = await request(app)
            .get(`/api/public/projects/${share.body.share_token}`);

        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Test Project');
        expect(res.body.milestones.length).toBe(4);
        expect(res.body.userId).toBeUndefined();
        expect(res.body.share_token).toBeUndefined();
    });

    it('public endpoint returns 404 for an unknown token', async () => {
        const res = await request(app)
            .get(`/api/public/projects/${'0'.repeat(64)}`);
        expect(res.status).toBe(404);
    });

    it('revoking the share token makes the public link 404', async () => {
        const { token, project } = await createProjectAndToken();
        const share = await request(app)
            .post(`/api/projects/${project._id}/share`)
            .set('Authorization', `Bearer ${token}`);

        const revoke = await request(app)
            .delete(`/api/projects/${project._id}/share`)
            .set('Authorization', `Bearer ${token}`);
        expect(revoke.status).toBe(200);

        const res = await request(app)
            .get(`/api/public/projects/${share.body.share_token}`);
        expect(res.status).toBe(404);
    });
});


// ═════════════════════════════════════════════
// Reviews — GET history
// ═════════════════════════════════════════════

describe('GET /api/review', () => {
    const Review = require('../models/Review');

    afterEach(async () => {
        await Review.deleteMany({});
    });

    it('returns 401 without token', async () => {
        const res = await request(app).get('/api/review');
        expect(res.status).toBe(401);
    });

    it("returns only the logged-in user's reviews, newest first", async () => {
        const { user: user1, token: token1 } = await createUserAndToken();
        const user2 = await createUser('other@example.com');

        await Review.create({ userId: user1._id, repo_url: 'https://github.com/a/old', repo: 'a/old', mode: 'heuristic', language: 'Python' });
        await new Promise(r => setTimeout(r, 10));
        await Review.create({ userId: user1._id, repo_url: 'https://github.com/a/new', repo: 'a/new', mode: 'llm' });
        await Review.create({ userId: user2._id, repo_url: 'https://github.com/b/theirs', repo: 'b/theirs', mode: 'llm' });

        const res = await request(app)
            .get('/api/review')
            .set('Authorization', `Bearer ${token1}`);

        expect(res.status).toBe(200);
        expect(res.body.length).toBe(2);
        expect(res.body[0].repo).toBe('a/new');
        expect(res.body[1].repo).toBe('a/old');
        expect(res.body[1].language).toBe('Python');
    });
});

// ═════════════════════════════════════════════
// Quest turn-in — POST /api/projects/:id/turn-in
// ═════════════════════════════════════════════

describe('POST /api/projects/:id/turn-in', () => {
    const Review = require('../models/Review');

    const MOCK_VERIFY_RESPONSE = {
        repo: 'someone/builtrepo',
        mode: 'heuristic',
        language: 'JavaScript',
        features: [
            { feature: 'Auth', verdict: 'evident', evidence: 'files: src/auth.js' },
            { feature: 'CRUD', verdict: 'partial', evidence: 'README mentions: crud' },
        ],
        milestones: [
            { milestone: 'Week 1', verdict: 'done', evidence: 'files: src/index.js' },
        ],
        stack_match: { verdict: 'match', rationale: 'node detected' },
        completion: {
            percent: 75,
            verdict: 'substantial',
            summary: '1/2 core features evident, 1 partial; 1/1 milestones done.',
        },
    };

    let token, user, project;

    beforeEach(async () => {
        const result = await createUserAndToken();
        token = result.token;
        user = result.user;
        project = await Project.create({
            userId: user._id,
            ...MOCK_AI_RESPONSE,
            input: { topic: 'web development', difficulty: 'beginner', stack: 'React, Node.js', hours_per_week: 10 },
        });
    });

    afterEach(async () => {
        await Review.deleteMany({});
    });

    it('verifies the repo, snapshots the verdict onto the project, and links a review', async () => {
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_VERIFY_RESPONSE });

        const res = await request(app)
            .post(`/api/projects/${project._id}/turn-in`)
            .set('Authorization', `Bearer ${token}`)
            .send({ repo_url: 'https://github.com/someone/builtrepo' });

        expect(res.status).toBe(200);

        // Project snapshot
        expect(res.body.project.repo_url).toBe('https://github.com/someone/builtrepo');
        expect(res.body.project.turn_in.percent).toBe(75);
        expect(res.body.project.turn_in.verdict).toBe('substantial');
        expect(res.body.project.turn_in.features).toHaveLength(2);
        expect(res.body.project.turn_in.stack_match.verdict).toBe('match');

        // Linked review
        expect(res.body.review.kind).toBe('turn_in');
        expect(res.body.review.projectId).toBe(String(project._id));
        const saved = await Review.findById(res.body.review._id);
        expect(saved.verification.completion.percent).toBe(75);
        expect(String(res.body.project.turn_in.reviewId)).toBe(String(saved._id));

        // The AI service received the original brief
        const sentBody = axios.post.mock.calls[0][1];
        expect(sentBody.brief.core_features).toEqual(MOCK_AI_RESPONSE.core_features);
        expect(sentBody.brief.milestones).toEqual(MOCK_AI_RESPONSE.milestones);
        expect(sentBody.brief.stack).toBe('React, Node.js');
    });

    it('re-turn-in replaces the snapshot with the latest verdict', async () => {
        const axios = require('axios');
        axios.post = jest.fn()
            .mockResolvedValueOnce({ data: MOCK_VERIFY_RESPONSE })
            .mockResolvedValueOnce({
                data: {
                    ...MOCK_VERIFY_RESPONSE,
                    completion: { percent: 100, verdict: 'complete', summary: 'All done.' },
                },
            });

        await request(app)
            .post(`/api/projects/${project._id}/turn-in`)
            .set('Authorization', `Bearer ${token}`)
            .send({ repo_url: 'https://github.com/someone/builtrepo' });
        const res = await request(app)
            .post(`/api/projects/${project._id}/turn-in`)
            .set('Authorization', `Bearer ${token}`)
            .send({ repo_url: 'https://github.com/someone/builtrepo' });

        expect(res.body.project.turn_in.percent).toBe(100);
        expect(res.body.project.turn_in.verdict).toBe('complete');
        // Both turn-ins remain in review history
        expect(await Review.countDocuments({ projectId: project._id, kind: 'turn_in' })).toBe(2);
    });

    it('returns 404 for another user\'s project', async () => {
        const { token: otherToken } = await createUserAndToken('other@example.com');
        const res = await request(app)
            .post(`/api/projects/${project._id}/turn-in`)
            .set('Authorization', `Bearer ${otherToken}`)
            .send({ repo_url: 'https://github.com/someone/builtrepo' });
        expect(res.status).toBe(404);
        expect(await Review.countDocuments({})).toBe(0);
    });

    it('returns 422 without a repo_url', async () => {
        const res = await request(app)
            .post(`/api/projects/${project._id}/turn-in`)
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(res.status).toBe(422);
    });

    it('returns 401 without a token', async () => {
        const res = await request(app)
            .post(`/api/projects/${project._id}/turn-in`)
            .send({ repo_url: 'https://github.com/someone/builtrepo' });
        expect(res.status).toBe(401);
    });

    it('maps AI-service repo-not-found to 404 and saves nothing', async () => {
        const axios = require('axios');
        const err = new Error('not found');
        err.response = { status: 404, data: { detail: 'Repository not found' } };
        axios.post = jest.fn().mockRejectedValueOnce(err);

        const res = await request(app)
            .post(`/api/projects/${project._id}/turn-in`)
            .set('Authorization', `Bearer ${token}`)
            .send({ repo_url: 'https://github.com/someone/ghost' });

        expect(res.status).toBe(404);
        expect(await Review.countDocuments({})).toBe(0);
        const fresh = await Project.findById(project._id);
        expect(fresh.turn_in).toBeUndefined();
    });

    it('maps GitHub rate limiting (503) through', async () => {
        const axios = require('axios');
        const err = new Error('rate limited');
        err.response = { status: 503, data: { detail: 'GitHub API rate limit' } };
        axios.post = jest.fn().mockRejectedValueOnce(err);

        const res = await request(app)
            .post(`/api/projects/${project._id}/turn-in`)
            .set('Authorization', `Bearer ${token}`)
            .send({ repo_url: 'https://github.com/someone/builtrepo' });
        expect(res.status).toBe(503);
    });

    it('returns 504 when verification times out', async () => {
        const axios = require('axios');
        const err = new Error('timeout of 120000ms exceeded');
        err.code = 'ECONNABORTED';
        axios.post = jest.fn().mockRejectedValueOnce(err);

        const res = await request(app)
            .post(`/api/projects/${project._id}/turn-in`)
            .set('Authorization', `Bearer ${token}`)
            .send({ repo_url: 'https://github.com/someone/builtrepo' });
        expect(res.status).toBe(504);
    });

    it('turn-in reviews appear alongside inspections in GET /api/review', async () => {
        const axios = require('axios');
        axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_VERIFY_RESPONSE });

        await Review.create({
            userId: user._id,
            repo_url: 'https://github.com/someone/otherrepo',
            repo: 'someone/otherrepo',
            mode: 'heuristic',
            scores: { hiring_signal: { score: 5, rationale: 'ok' } },
        });
        await request(app)
            .post(`/api/projects/${project._id}/turn-in`)
            .set('Authorization', `Bearer ${token}`)
            .send({ repo_url: 'https://github.com/someone/builtrepo' });

        const res = await request(app)
            .get('/api/review')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        const kinds = res.body.map(r => r.kind || 'inspection').sort();
        expect(kinds).toEqual(['inspection', 'turn_in']);
    });
});


// ═════════════════════════════════════════════
// Server-side XP — idempotency, backfill, stats, achievements
// ═════════════════════════════════════════════

describe('Server-side XP', () => {
    const XpEvent = require('../models/XpEvent');
    const Review = require('../models/Review');
    const {
        awardXp, awardQuestAccept, awardMilestones, awardTurnInTiers,
        ensureBackfill, computeStats, evaluateAchievements,
    } = require('../utils/xp');

    afterEach(async () => {
        await XpEvent.deleteMany({});
        await Review.deleteMany({});
    });

    describe('awardXp idempotency', () => {
        it('awards once for a given key and silently no-ops on repeat', async () => {
            const { user } = await createUserAndToken();
            const first = await awardXp({ userId: user._id, key: `${user._id}:test:1`, type: 'test', amount: 10 });
            const second = await awardXp({ userId: user._id, key: `${user._id}:test:1`, type: 'test', amount: 10 });
            expect(first).not.toBeNull();
            expect(second).toBeNull();
            expect(await XpEvent.countDocuments({ userId: user._id })).toBe(1);
        });

        it('is race-safe under concurrent calls with the same key', async () => {
            const { user } = await createUserAndToken();
            const args = { userId: user._id, key: `${user._id}:race:1`, type: 'test', amount: 5 };
            const results = await Promise.all([awardXp(args), awardXp(args), awardXp(args)]);
            const awarded = results.filter(r => r !== null);
            expect(awarded).toHaveLength(1);
            expect(await XpEvent.countDocuments({ userId: user._id })).toBe(1);
        });
    });

    describe('milestone toggle-farming', () => {
        it('toggling a milestone off and back on awards XP exactly once', async () => {
            const { user } = await createUserAndToken();
            const project = await Project.create({
                userId: user._id, ...MOCK_AI_RESPONSE,
                input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
            });

            await awardMilestones(user._id, project._id, [0]); // on
            await awardMilestones(user._id, project._id, [0]); // "on" again (same index, idempotent)
            await awardMilestones(user._id, project._id, [0]); // re-check after an uncheck

            expect(await XpEvent.countDocuments({ userId: user._id, type: 'milestone' })).toBe(1);
        });

        it('awards separately for distinct milestone indices', async () => {
            const { user } = await createUserAndToken();
            const project = await Project.create({
                userId: user._id, ...MOCK_AI_RESPONSE,
                input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
            });
            const total = await awardMilestones(user._id, project._id, [0, 1]);
            expect(total).toBe(20); // 2 * MILESTONE_XP(10)
            expect(await XpEvent.countDocuments({ userId: user._id, type: 'milestone' })).toBe(2);
        });
    });

    describe('turn-in tier cumulative awarding', () => {
        it('awards all tiers up to and including the reached verdict on first run', async () => {
            const { user } = await createUserAndToken();
            const project = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, input: {} });
            const total = await awardTurnInTiers(user._id, project._id, 'complete');
            expect(total).toBe(25 + 50 + 75); // partial + substantial + complete
        });

        it('re-running at the same tier awards nothing further', async () => {
            const { user } = await createUserAndToken();
            const project = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, input: {} });
            await awardTurnInTiers(user._id, project._id, 'substantial');
            const second = await awardTurnInTiers(user._id, project._id, 'substantial');
            expect(second).toBe(0);
        });

        it('improving from partial to complete awards only the new tiers', async () => {
            const { user } = await createUserAndToken();
            const project = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, input: {} });
            await awardTurnInTiers(user._id, project._id, 'partial');
            const upgrade = await awardTurnInTiers(user._id, project._id, 'complete');
            expect(upgrade).toBe(50 + 75); // substantial + complete only
        });
    });

    describe('lazy backfill', () => {
        it('synthesizes XP for a pre-existing user with no XpEvents', async () => {
            const { user } = await createUserAndToken();
            const project = await Project.create({
                userId: user._id, ...MOCK_AI_RESPONSE,
                completed_milestones: [0, 1],
                input: { topic: 'x', difficulty: 'advanced', stack: 'y', hours_per_week: 5 },
            });

            await ensureBackfill(user._id);

            const stats = await computeStats(user._id);
            // 100 (advanced quest_accept) + 2*10 (milestones) = 120
            expect(stats.total_xp).toBe(120);
            expect(stats.counts.quests).toBe(1);
            expect(stats.counts.stages_cleared).toBe(2);
        });

        it('is idempotent — repeated backfills do not double-award', async () => {
            const { user } = await createUserAndToken();
            await Project.create({
                userId: user._id, ...MOCK_AI_RESPONSE,
                completed_milestones: [0],
                input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
            });

            await ensureBackfill(user._id);
            const first = await computeStats(user._id);
            await ensureBackfill(user._id);
            await ensureBackfill(user._id);
            const second = await computeStats(user._id);

            expect(second.total_xp).toBe(first.total_xp);
            expect(await XpEvent.countDocuments({ userId: user._id, type: 'backfill' })).toBe(1);
        });
    });

    describe('achievements', () => {
        it('unlocks first_quest once a quest exists and does not re-unlock', async () => {
            const { user } = await createUserAndToken();
            await Project.create({
                userId: user._id, ...MOCK_AI_RESPONSE,
                input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
            });

            const first = await evaluateAchievements(user._id);
            expect(first).toContain('first_quest');
            const second = await evaluateAchievements(user._id);
            expect(second).not.toContain('first_quest');

            const stats = await computeStats(user._id);
            const achievement = stats.achievements.find(a => a.id === 'first_quest');
            expect(achievement.unlocked).toBe(true);
        });

        it('locked achievements report unlocked: false', async () => {
            const { user } = await createUserAndToken();
            const stats = await computeStats(user._id);
            expect(stats.achievements.every(a => a.unlocked === false)).toBe(true);
        });
    });

    describe('quest_accept idempotency', () => {
        it('awarding twice for the same project only counts once', async () => {
            const { user } = await createUserAndToken();
            const project = await Project.create({
                userId: user._id, ...MOCK_AI_RESPONSE,
                input: { topic: 'x', difficulty: 'intermediate', stack: 'y', hours_per_week: 5 },
            });
            const first = await awardQuestAccept(user._id, project);
            const second = await awardQuestAccept(user._id, project);
            expect(first.amount).toBe(60);
            expect(second).toBeNull();
        });
    });
});


// ═════════════════════════════════════════════
// GET /api/stats
// ═════════════════════════════════════════════

describe('GET /api/stats', () => {
    const XpEvent = require('../models/XpEvent');

    afterEach(async () => {
        await XpEvent.deleteMany({});
    });

    it('requires auth', async () => {
        const res = await request(app).get('/api/stats');
        expect(res.status).toBe(401);
    });

    it('returns zeroed stats for a brand-new user', async () => {
        const { token } = await createUserAndToken();
        const res = await request(app)
            .get('/api/stats')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.total_xp).toBe(0);
        expect(res.body.level).toBe(1);
        expect(Array.isArray(res.body.achievements)).toBe(true);
        expect(res.body.achievements.length).toBeGreaterThan(0);
    });

    it('backfills and reflects an existing project + completed milestones', async () => {
        const { token, user } = await createUserAndToken();
        await Project.create({
            userId: user._id, ...MOCK_AI_RESPONSE,
            completed_milestones: [0],
            input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
        });

        const res = await request(app)
            .get('/api/stats')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        // 30 (beginner quest_accept) + 10 (1 milestone) + 40 (first_quest achievement)
        expect(res.body.total_xp).toBe(80);
        expect(res.body.counts.quests).toBe(1);
        const achievement = res.body.achievements.find(a => a.id === 'first_quest');
        expect(achievement.unlocked).toBe(true);
    });
});


// ═════════════════════════════════════════════
// Quest Board — publish, gallery, accept, leaderboard
// ═════════════════════════════════════════════

describe('Quest Board', () => {
    const XpEvent = require('../models/XpEvent');

    afterEach(async () => {
        await XpEvent.deleteMany({});
    });

    async function createPublishedProject(userId, overrides = {}) {
        return Project.create({
            userId,
            ...MOCK_AI_RESPONSE,
            published: true,
            published_at: new Date(),
            share_token: 'secret-token-should-never-leak',
            repo_url: 'https://github.com/owner/private-link',
            input: { topic: 'web development', difficulty: 'beginner', stack: 'React', hours_per_week: 10 },
            ...overrides,
        });
    }

    describe('publish / unpublish', () => {
        it('publishes and unpublishes an owned project', async () => {
            const { token, user } = await createUserAndToken();
            const project = await Project.create({
                userId: user._id, ...MOCK_AI_RESPONSE,
                input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
            });

            const pub = await request(app)
                .post(`/api/projects/${project._id}/publish`)
                .set('Authorization', `Bearer ${token}`);
            expect(pub.status).toBe(200);
            expect(pub.body.published).toBe(true);
            expect(pub.body.published_at).toBeDefined();

            const unpub = await request(app)
                .delete(`/api/projects/${project._id}/publish`)
                .set('Authorization', `Bearer ${token}`);
            expect(unpub.status).toBe(200);
            expect(unpub.body.published).toBe(false);

            const fresh = await Project.findById(project._id);
            expect(fresh.published).toBe(false);
        });

        it("returns 404 when publishing another user's project", async () => {
            const { user } = await createUserAndToken();
            const { token: otherToken } = await createUserAndToken('other@example.com');
            const project = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, input: {} });

            const res = await request(app)
                .post(`/api/projects/${project._id}/publish`)
                .set('Authorization', `Bearer ${otherToken}`);
            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/public/gallery', () => {
        it('lists only published quests, without auth, and leaks no private fields', async () => {
            const { user } = await createUserAndToken();
            await createPublishedProject(user._id);
            await Project.create({
                userId: user._id, ...MOCK_AI_RESPONSE, title: 'Unpublished quest',
                input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
            });

            const res = await request(app).get('/api/public/gallery');

            expect(res.status).toBe(200);
            expect(res.body.items).toHaveLength(1);
            expect(res.body.total).toBe(1);
            const item = res.body.items[0];
            expect(item.title).toBe(MOCK_AI_RESPONSE.title);
            expect(item.difficulty).toBe('beginner');
            expect(item.milestone_count).toBe(4);
            // Never expose private/internal fields
            expect(item.userId).toBeUndefined();
            expect(item.share_token).toBeUndefined();
            expect(item.repo_url).toBeUndefined();
            expect(item.turn_in).toBeUndefined();
        });

        it('paginates', async () => {
            const { user } = await createUserAndToken();
            for (let i = 0; i < 15; i++) {
                await createPublishedProject(user._id, {
                    title: `Quest ${i}`,
                    share_token: undefined,
                    published_at: new Date(Date.now() - i * 1000),
                });
            }

            const page1 = await request(app).get('/api/public/gallery?page=1&limit=12');
            const page2 = await request(app).get('/api/public/gallery?page=2&limit=12');

            expect(page1.body.items).toHaveLength(12);
            expect(page2.body.items).toHaveLength(3);
            expect(page1.body.total_pages).toBe(2);
            // Newest first
            expect(page1.body.items[0].title).toBe('Quest 0');
        });

        it('filters by difficulty', async () => {
            const { user } = await createUserAndToken();
            await createPublishedProject(user._id, { share_token: undefined });
            await createPublishedProject(user._id, {
                title: 'Hard quest',
                share_token: undefined,
                input: { topic: 'x', difficulty: 'advanced', stack: 'y', hours_per_week: 5 },
            });

            const res = await request(app).get('/api/public/gallery?difficulty=advanced');
            expect(res.body.items).toHaveLength(1);
            expect(res.body.items[0].title).toBe('Hard quest');
        });
    });

    describe('GET /api/public/gallery/:id', () => {
        it('returns the full brief for a published quest without leaking private fields', async () => {
            const { user } = await createUserAndToken();
            const project = await createPublishedProject(user._id);

            const res = await request(app).get(`/api/public/gallery/${project._id}`);

            expect(res.status).toBe(200);
            expect(res.body.title).toBe(MOCK_AI_RESPONSE.title);
            expect(res.body.core_features).toEqual(MOCK_AI_RESPONSE.core_features);
            expect(res.body.userId).toBeUndefined();
            expect(res.body.share_token).toBeUndefined();
            expect(res.body.repo_url).toBeUndefined();
            expect(res.body.turn_in).toBeUndefined();
        });

        it('returns 404 for an unpublished quest', async () => {
            const { user } = await createUserAndToken();
            const project = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, input: {} });

            const res = await request(app).get(`/api/public/gallery/${project._id}`);
            expect(res.status).toBe(404);
        });

        it('returns 404 (not 500) for a malformed id', async () => {
            const res = await request(app).get('/api/public/gallery/not-an-id');
            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/projects/accept', () => {
        it('clones a published quest with fresh progress and provenance', async () => {
            const { user } = await createUserAndToken();
            const source = await createPublishedProject(user._id, {
                completed_milestones: [0, 1, 2],
            });
            const { token: accepterToken, user: accepter } = await createUserAndToken('accepter@example.com');

            const res = await request(app)
                .post('/api/projects/accept')
                .set('Authorization', `Bearer ${accepterToken}`)
                .send({ sourceProjectId: source._id });

            expect(res.status).toBe(200);
            expect(res.body._id).not.toBe(String(source._id));
            expect(res.body.title).toBe(source.title);
            expect(res.body.completed_milestones).toEqual([]);
            expect(res.body.share_token).toBeUndefined();
            expect(res.body.published).toBe(false);
            expect(res.body.origin.kind).toBe('gallery');
            expect(res.body.origin.sourceProjectId).toBe(String(source._id));

            const cloned = await Project.findById(res.body._id);
            expect(String(cloned.userId)).toBe(String(accepter._id));
        });

        it('rejects an unpublished source with 404', async () => {
            const { user } = await createUserAndToken();
            const source = await Project.create({ userId: user._id, ...MOCK_AI_RESPONSE, input: {} });
            const { token: accepterToken } = await createUserAndToken('accepter@example.com');

            const res = await request(app)
                .post('/api/projects/accept')
                .set('Authorization', `Bearer ${accepterToken}`)
                .send({ sourceProjectId: source._id });
            expect(res.status).toBe(404);
        });

        it('requires auth', async () => {
            const res = await request(app)
                .post('/api/projects/accept')
                .send({ sourceProjectId: new mongoose.Types.ObjectId() });
            expect(res.status).toBe(401);
        });

        it('requires sourceProjectId', async () => {
            const { token } = await createUserAndToken();
            const res = await request(app)
                .post('/api/projects/accept')
                .set('Authorization', `Bearer ${token}`)
                .send({});
            expect(res.status).toBe(422);
        });
    });

    describe('GET /api/public/leaderboard', () => {
        it('returns masked names and XP totals, never emails', async () => {
            const { user } = await createUserAndToken('champion@example.com');
            await XpEvent.create({
                userId: user._id, key: `${user._id}:test:lead`, type: 'test', amount: 300,
            });

            // Bust the 60s in-memory cache by requesting after data exists;
            // cache starts empty in each fresh test DB anyway.
            const res = await request(app).get('/api/public/leaderboard?_=' + Date.now());

            expect(res.status).toBe(200);
            const entry = res.body.find(e => e.total_xp === 300);
            expect(entry).toBeDefined();
            expect(entry.level).toBe(2); // 1 + floor(300/250)
            expect(entry.name_masked).toMatch(/\*\*\*$/);
            expect(entry.name_masked).not.toContain('@');
            expect(JSON.stringify(res.body)).not.toContain('example.com');
        });
    });

    it('share endpoint /api/public/projects/:token still works and stays allowlisted', async () => {
        const { user } = await createUserAndToken();
        await createPublishedProject(user._id, { share_token: 'tok-abc-123' });

        const res = await request(app).get('/api/public/projects/tok-abc-123');
        expect(res.status).toBe(200);
        expect(res.body.title).toBe(MOCK_AI_RESPONSE.title);
        expect(res.body.userId).toBeUndefined();
        expect(res.body.share_token).toBeUndefined();
        expect(res.body.turn_in).toBeUndefined();
        expect(res.body.repo_url).toBeUndefined();
    });
});


// ═════════════════════════════════════════════
// Polish pack — scope_notes, provenance, milestone dates
// ═════════════════════════════════════════════

describe('Polish pack', () => {
    const Review = require('../models/Review');
    const XpEvent = require('../models/XpEvent');

    afterEach(async () => {
        await Review.deleteMany({});
        await XpEvent.deleteMany({});
    });

    describe('scope_notes persistence', () => {
        it('survives generation into the saved project', async () => {
            const { token } = await createUserAndToken();
            const axios = require('axios');
            axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_AI_RESPONSE });

            const res = await request(app)
                .post('/api/generate')
                .set('Authorization', `Bearer ${token}`)
                .send(VALID_GENERATE_PAYLOAD);

            expect(res.status).toBe(202);
            const saved = await waitForStatus(res.body._id);
            expect(saved.status).toBe('complete');
            expect(saved.scope_notes).toBe('Scope looks appropriate.');
        });

        it('appears in the public share payload', async () => {
            const { user } = await createUserAndToken();
            await Project.create({
                userId: user._id, ...MOCK_AI_RESPONSE,
                share_token: 'scope-note-token',
                input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
            });

            const res = await request(app).get('/api/public/projects/scope-note-token');
            expect(res.body.scope_notes).toBe('Scope looks appropriate.');
            // Personal planning data stays private
            expect(res.body.milestone_dates).toBeUndefined();
            expect(res.body.sourceReviewId).toBeUndefined();
        });
    });

    describe('generate provenance (source_review_id)', () => {
        async function generateWith(token, sourceReviewId) {
            const axios = require('axios');
            axios.post = jest.fn().mockResolvedValueOnce({ data: MOCK_AI_RESPONSE });
            return request(app)
                .post('/api/generate')
                .set('Authorization', `Bearer ${token}`)
                .send({ ...VALID_GENERATE_PAYLOAD, source_review_id: sourceReviewId });
        }

        it("links the user's own review and denormalizes the repo name", async () => {
            const { token, user } = await createUserAndToken();
            const review = await Review.create({
                userId: user._id, repo_url: 'https://github.com/me/myrepo',
                repo: 'me/myrepo', mode: 'heuristic',
            });

            const res = await generateWith(token, String(review._id));

            expect(res.status).toBe(202);
            const saved = await waitForStatus(res.body._id);
            expect(saved.source_repo).toBe('me/myrepo');
            expect(String(saved.sourceReviewId)).toBe(String(review._id));
        });

        it("silently ignores another user's review id", async () => {
            const { user: other } = await createUserAndToken('other@example.com');
            const { token } = await createUserAndToken();
            const foreign = await Review.create({
                userId: other._id, repo_url: 'https://github.com/x/y',
                repo: 'x/y', mode: 'heuristic',
            });

            const res = await generateWith(token, String(foreign._id));

            expect(res.status).toBe(202);
            const saved = await waitForStatus(res.body._id);
            expect(saved.source_repo).toBeUndefined();
            expect(saved.sourceReviewId).toBeUndefined();
        });

        it('silently ignores a garbage id', async () => {
            const { token } = await createUserAndToken();
            const res = await generateWith(token, 'not-an-object-id');
            expect(res.status).toBe(202);
            const saved = await waitForStatus(res.body._id);
            expect(saved.status).toBe('complete');
            expect(saved.sourceReviewId).toBeUndefined();
        });
    });

    describe('PATCH /api/projects/:id/milestone-dates', () => {
        let token, project;

        beforeEach(async () => {
            const result = await createUserAndToken();
            token = result.token;
            project = await Project.create({
                userId: result.user._id, ...MOCK_AI_RESPONSE,
                input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
            });
        });

        it('saves valid dates aligned with milestones', async () => {
            const res = await request(app)
                .patch(`/api/projects/${project._id}/milestone-dates`)
                .set('Authorization', `Bearer ${token}`)
                .send({ milestone_dates: ['2026-07-14', '', '2026-07-28'] });

            expect(res.status).toBe(200);
            expect(res.body.milestone_dates).toEqual(['2026-07-14', '', '2026-07-28']);
            const fresh = await Project.findById(project._id);
            expect(fresh.milestone_dates).toEqual(['2026-07-14', '', '2026-07-28']);
        });

        it('rejects a malformed date with 422', async () => {
            const res = await request(app)
                .patch(`/api/projects/${project._id}/milestone-dates`)
                .set('Authorization', `Bearer ${token}`)
                .send({ milestone_dates: ['14/07/2026'] });
            expect(res.status).toBe(422);
        });

        it('rejects more dates than milestones with 422', async () => {
            const res = await request(app)
                .patch(`/api/projects/${project._id}/milestone-dates`)
                .set('Authorization', `Bearer ${token}`)
                .send({ milestone_dates: ['', '', '', '', ''] }); // 5 > 4 milestones
            expect(res.status).toBe(422);
        });

        it('rejects a non-array body with 422', async () => {
            const res = await request(app)
                .patch(`/api/projects/${project._id}/milestone-dates`)
                .set('Authorization', `Bearer ${token}`)
                .send({ milestone_dates: '2026-07-14' });
            expect(res.status).toBe(422);
        });

        it("404s another user's project", async () => {
            const { token: otherToken } = await createUserAndToken('other@example.com');
            const res = await request(app)
                .patch(`/api/projects/${project._id}/milestone-dates`)
                .set('Authorization', `Bearer ${otherToken}`)
                .send({ milestone_dates: ['2026-07-14'] });
            expect(res.status).toBe(404);
        });
    });
});


// ═════════════════════════════════════════════
// Handles, /api/me, public adventurer profiles
// ═════════════════════════════════════════════

describe('User handles', () => {
    it('signup assigns a handle derived from the email', async () => {
        await request(app)
            .post('/api/auth/signup')
            .send({ email: 'zelda@example.com', password: 'password123' });

        const user = await User.findOne({ email: 'zelda@example.com' });
        expect(user.handle).toBe('zelda');
    });

    it('disambiguates a colliding handle', async () => {
        await request(app)
            .post('/api/auth/signup')
            .send({ email: 'link@example.com', password: 'password123' });
        await request(app)
            .post('/api/auth/signup')
            .send({ email: 'link@other.com', password: 'password123' });

        const users = await User.find({ handle: { $regex: '^link' } });
        expect(users).toHaveLength(2);
        expect(new Set(users.map(u => u.handle)).size).toBe(2);
    });
});

describe('GET /api/me', () => {
    it('requires auth', async () => {
        const res = await request(app).get('/api/me');
        expect(res.status).toBe(401);
    });

    it('returns email, handle, and public_profile', async () => {
        const { token, user } = await createUserAndToken('handle-test@example.com');
        const res = await request(app)
            .get('/api/me')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.email).toBe(user.email);
        expect(res.body.handle).toBe('handle-test');
        expect(res.body.public_profile).toBe(false);
    });

    it('lazily backfills a handle for a legacy user with none', async () => {
        const hashed = await bcrypt.hash('password123', 10);
        const legacy = await User.create({ email: 'legacy@example.com', password: hashed });
        expect(legacy.handle).toBeUndefined();
        const token = makeToken(legacy._id);

        const res = await request(app)
            .get('/api/me')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.handle).toBe('legacy');
        const fresh = await User.findById(legacy._id);
        expect(fresh.handle).toBe('legacy');
    });
});

describe('PATCH /api/me/public-profile', () => {
    it('requires auth', async () => {
        const res = await request(app)
            .patch('/api/me/public-profile')
            .send({ public_profile: true });
        expect(res.status).toBe(401);
    });

    it('rejects a non-boolean value', async () => {
        const { token } = await createUserAndToken();
        const res = await request(app)
            .patch('/api/me/public-profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ public_profile: 'yes' });
        expect(res.status).toBe(422);
    });

    it('toggles public_profile on and off', async () => {
        const { token, user } = await createUserAndToken();

        const on = await request(app)
            .patch('/api/me/public-profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ public_profile: true });
        expect(on.status).toBe(200);
        expect(on.body.public_profile).toBe(true);

        const off = await request(app)
            .patch('/api/me/public-profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ public_profile: false });
        expect(off.body.public_profile).toBe(false);

        const fresh = await User.findById(user._id);
        expect(fresh.public_profile).toBe(false);
    });
});

describe('GET /api/public/adventurer/:handle', () => {
    const XpEvent = require('../models/XpEvent');

    afterEach(async () => {
        await XpEvent.deleteMany({});
    });

    it('404s for an unknown handle', async () => {
        const res = await request(app).get('/api/public/adventurer/nobody-here');
        expect(res.status).toBe(404);
    });

    it('404s for a real handle that has not opted in (never confirms existence)', async () => {
        await createUserAndToken('private-person@example.com');
        const res = await request(app).get('/api/public/adventurer/private-person');
        expect(res.status).toBe(404);
    });

    it('returns level, xp, achievements, skills, and published quests for an opted-in adventurer', async () => {
        const { token, user } = await createUserAndToken('showoff@example.com');
        await request(app)
            .patch('/api/me/public-profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ public_profile: true });

        const project = await Project.create({
            userId: user._id, ...MOCK_AI_RESPONSE,
            published: true, published_at: new Date(), accepted_count: 2,
            input: { topic: 'x', difficulty: 'intermediate', stack: 'React', hours_per_week: 5 },
        });
        await request(app)
            .patch(`/api/projects/${project._id}/progress`)
            .set('Authorization', `Bearer ${token}`)
            .send({ completed_milestones: [0] });

        const res = await request(app).get('/api/public/adventurer/showoff');

        expect(res.status).toBe(200);
        expect(res.body.handle).toBe('showoff');
        expect(res.body.total_xp).toBeGreaterThan(0);
        expect(res.body.counts.stages_cleared).toBe(1);
        expect(res.body.achievements.every(a => a.unlocked !== false)).toBe(true);
        expect(res.body.skills.some(s => s.skill === 'REST APIs')).toBe(true);
        const quest = res.body.published_quests.find(q => q._id === String(project._id));
        expect(quest).toBeDefined();
        expect(quest.accepted_count).toBe(2);
        expect(quest.difficulty).toBe('intermediate');
    });

    it('never leaks email in the public response', async () => {
        const { token } = await createUserAndToken('secretemail@example.com');
        await request(app)
            .patch('/api/me/public-profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ public_profile: true });

        const res = await request(app).get('/api/public/adventurer/secretemail');
        expect(JSON.stringify(res.body)).not.toContain('secretemail@example.com');
    });

    it('omits unpublished projects from published_quests', async () => {
        const { token, user } = await createUserAndToken('hoarder@example.com');
        await request(app)
            .patch('/api/me/public-profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ public_profile: true });
        await Project.create({
            userId: user._id, ...MOCK_AI_RESPONSE, title: 'Secret draft',
            input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
        });

        const res = await request(app).get('/api/public/adventurer/hoarder');
        expect(res.body.published_quests).toHaveLength(0);
    });
});


// ═════════════════════════════════════════════
// Account settings — name, email, password, delete
// ═════════════════════════════════════════════

describe('Account: name on signup/login', () => {
    it('defaults name to the email localpart when none is given', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ email: 'ganon@example.com', password: 'password123' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('ganon');
        const user = await User.findOne({ email: 'ganon@example.com' });
        expect(user.name).toBe('ganon');
    });

    it('accepts an explicit name at signup', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ email: 'midna@example.com', password: 'password123', name: 'Twilight Princess' });
        expect(res.body.name).toBe('Twilight Princess');
    });

    it('login returns the stored name', async () => {
        await request(app)
            .post('/api/auth/signup')
            .send({ email: 'sheik@example.com', password: 'password123', name: 'Sheik' });
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'sheik@example.com', password: 'password123' });
        expect(res.body.name).toBe('Sheik');
    });
});

describe('GET /api/me (account fields)', () => {
    it('returns name and createdAt', async () => {
        const { token } = await createUserAndToken('fields@example.com');
        const res = await request(app)
            .get('/api/me')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.name).toBeDefined();
        expect(res.body.createdAt).toBeDefined();
        expect(res.body.email).toBe('fields@example.com');
    });
});

describe('PATCH /api/me/profile', () => {
    it('requires auth', async () => {
        const res = await request(app).patch('/api/me/profile').send({ name: 'x' });
        expect(res.status).toBe(401);
    });

    it('updates the display name', async () => {
        const { token, user } = await createUserAndToken();
        const res = await request(app)
            .patch('/api/me/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: '  Hero of Time  ' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Hero of Time'); // trimmed
        const fresh = await User.findById(user._id);
        expect(fresh.name).toBe('Hero of Time');
    });

    it('rejects an empty name', async () => {
        const { token } = await createUserAndToken();
        const res = await request(app)
            .patch('/api/me/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: '   ' });
        expect(res.status).toBe(422);
    });

    it('rejects a name over 50 characters', async () => {
        const { token } = await createUserAndToken();
        const res = await request(app)
            .patch('/api/me/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'x'.repeat(51) });
        expect(res.status).toBe(422);
    });
});

describe('PATCH /api/me/email', () => {
    it('changes the email with the correct current password', async () => {
        const { token, user } = await createUserAndToken('old@example.com');
        const res = await request(app)
            .patch('/api/me/email')
            .set('Authorization', `Bearer ${token}`)
            .send({ email: 'new@example.com', current_password: 'password123' });
        expect(res.status).toBe(200);
        expect(res.body.email).toBe('new@example.com');
        const fresh = await User.findById(user._id);
        expect(fresh.email).toBe('new@example.com');
    });

    it('rejects a wrong current password with 401', async () => {
        const { token } = await createUserAndToken('guard@example.com');
        const res = await request(app)
            .patch('/api/me/email')
            .set('Authorization', `Bearer ${token}`)
            .send({ email: 'new@example.com', current_password: 'wrongpass' });
        expect(res.status).toBe(401);
    });

    it('rejects a duplicate email with 409', async () => {
        await createUser('taken@example.com');
        const { token } = await createUserAndToken('mover@example.com');
        const res = await request(app)
            .patch('/api/me/email')
            .set('Authorization', `Bearer ${token}`)
            .send({ email: 'taken@example.com', current_password: 'password123' });
        expect(res.status).toBe(409);
    });

    it('rejects a malformed email with 422', async () => {
        const { token } = await createUserAndToken();
        const res = await request(app)
            .patch('/api/me/email')
            .set('Authorization', `Bearer ${token}`)
            .send({ email: 'not-an-email', current_password: 'password123' });
        expect(res.status).toBe(422);
    });
});

describe('PATCH /api/me/password', () => {
    it('changes the password; old fails and new works at login', async () => {
        const { token } = await createUserAndToken('pw@example.com');
        const change = await request(app)
            .patch('/api/me/password')
            .set('Authorization', `Bearer ${token}`)
            .send({ current_password: 'password123', new_password: 'brandnewpass' });
        expect(change.status).toBe(200);

        const oldLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'pw@example.com', password: 'password123' });
        expect(oldLogin.status).toBe(401);

        const newLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'pw@example.com', password: 'brandnewpass' });
        expect(newLogin.status).toBe(200);
    });

    it('rejects a wrong current password with 401', async () => {
        const { token } = await createUserAndToken();
        const res = await request(app)
            .patch('/api/me/password')
            .set('Authorization', `Bearer ${token}`)
            .send({ current_password: 'wrongpass', new_password: 'brandnewpass' });
        expect(res.status).toBe(401);
    });

    it('rejects a too-short new password with 422', async () => {
        const { token } = await createUserAndToken();
        const res = await request(app)
            .patch('/api/me/password')
            .set('Authorization', `Bearer ${token}`)
            .send({ current_password: 'password123', new_password: 'short' });
        expect(res.status).toBe(422);
    });
});

describe('DELETE /api/me', () => {
    const Review = require('../models/Review');
    const XpEvent = require('../models/XpEvent');

    afterEach(async () => {
        await Review.deleteMany({});
        await XpEvent.deleteMany({});
    });

    it('requires auth', async () => {
        const res = await request(app).delete('/api/me').send({ current_password: 'password123' });
        expect(res.status).toBe(401);
    });

    it('rejects a wrong password with 401 and keeps the account', async () => {
        const { token, user } = await createUserAndToken();
        const res = await request(app)
            .delete('/api/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ current_password: 'wrongpass' });
        expect(res.status).toBe(401);
        expect(await User.findById(user._id)).not.toBeNull();
    });

    it('deletes the account and cascades owned projects, reviews, and XP', async () => {
        const { token, user } = await createUserAndToken('doomed@example.com');
        await Project.create({
            userId: user._id, ...MOCK_AI_RESPONSE,
            input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
        });
        await Review.create({
            userId: user._id, repo_url: 'https://github.com/a/b', repo: 'a/b', mode: 'heuristic',
        });
        await XpEvent.create({ userId: user._id, key: `${user._id}:x:1`, type: 'test', amount: 10 });

        const res = await request(app)
            .delete('/api/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ current_password: 'password123' });

        expect(res.status).toBe(200);
        expect(await User.findById(user._id)).toBeNull();
        expect(await Project.countDocuments({ userId: user._id })).toBe(0);
        expect(await Review.countDocuments({ userId: user._id })).toBe(0);
        expect(await XpEvent.countDocuments({ userId: user._id })).toBe(0);
    });

    it("does not touch another user's data", async () => {
        const { token, user } = await createUserAndToken('leaver@example.com');
        const { user: other } = await createUserAndToken('stayer@example.com');
        await Project.create({
            userId: other._id, ...MOCK_AI_RESPONSE,
            input: { topic: 'x', difficulty: 'beginner', stack: 'y', hours_per_week: 5 },
        });

        await request(app)
            .delete('/api/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ current_password: 'password123' });

        expect(await User.findById(other._id)).not.toBeNull();
        expect(await Project.countDocuments({ userId: other._id })).toBe(1);
    });
});
