const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
app.use(helmet());

// CORS allowlist — comma-separated origins, same pattern as the AI service's
// ALLOWED_ORIGINS env var. Defaults to the local Vite dev client.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/generate', require('./routes/generate'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/review', require('./routes/review'));

// Health checks
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => {
    res.json({
        status: mongoose.connection.readyState === 1 ? 'ok' : 'db_connecting',
        service: 'projectify-server'
    });
});

// Connect to MongoDB with retry logic
const PORT = process.env.PORT || 5000;

const connectDB = async (retries = 5) => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        if (retries > 0) {
            console.log(`⏳ Retrying in 5 seconds... (${retries} attempts left)`);
            await new Promise(res => setTimeout(res, 5000));
            return connectDB(retries - 1);
        }
        console.error('❌ Could not connect to MongoDB after multiple attempts. Exiting.');
        process.exit(1);
    }
};

if (require.main === module) {
    connectDB().then(() => {
        app.listen(PORT, () => console.log(`Server running on ${PORT}`));
    });
}

module.exports = app;