/**
 * Simple in-memory per-user rate limiter (factory).
 *
 * Each route that needs limiting creates its own instance so windows are
 * tracked independently. For production, replace with Redis
 * (e.g. express-rate-limit + rate-limit-redis).
 */

function createRateLimiter({ max = 5, windowMs = 60 * 1000, message } = {}) {
    const store = new Map(); // userId → array of timestamps

    // Cleanup interval to prevent memory leaks from inactive users
    const cleanupInterval = setInterval(() => {
        const windowStart = Date.now() - windowMs;
        for (const [userId, timestamps] of store.entries()) {
            const validTimestamps = timestamps.filter(t => t > windowStart);
            if (validTimestamps.length === 0) {
                store.delete(userId);
            } else {
                store.set(userId, validTimestamps);
            }
        }
    }, windowMs);
    cleanupInterval.unref(); // Allow Node process to exit even if interval is running

    return function rateLimit(req, res, next) {
        const userId = req.user.id;
        const now = Date.now();
        const windowStart = now - windowMs;

        const timestamps = (store.get(userId) || []).filter(t => t > windowStart);

        if (timestamps.length >= max) {
            store.set(userId, timestamps);
            return res.status(429).json({
                error: message || `Rate limit exceeded. Max ${max} requests per minute.`
            });
        }

        timestamps.push(now);
        store.set(userId, timestamps);
        next();
    };
}

module.exports = createRateLimiter;
