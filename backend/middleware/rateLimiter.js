import redis from '../config/redis.js';

/**
 * Tier-based rate limiting configuration
 */
const RATE_LIMITS = {
  free: {
    requests: parseInt(process.env.RATE_LIMIT_FREE) || 5,
    window: parseInt(process.env.RATE_LIMIT_WINDOW_SEC) || 60,
  },
  pro: {
    requests: parseInt(process.env.RATE_LIMIT_PRO) || 100,
    window: parseInt(process.env.RATE_LIMIT_WINDOW_SEC) || 60,
  },
  enterprise: {
    requests: parseInt(process.env.RATE_LIMIT_ENTERPRISE) || 1000,
    window: parseInt(process.env.RATE_LIMIT_WINDOW_SEC) || 60,
  },
};

/**
 * Enhanced rate limiter with tier-based limits
 */
export const tieredRateLimiter = async (req, res, next) => {
  try {
    // Determine user identifier
    const userId = req.userId || req.body.userId || req.ip;
    const tier = req.user?.subscription_tier || 'free';
    
    // Get rate limit for tier
    const limits = RATE_LIMITS[tier] || RATE_LIMITS.free;
    const key = `rate_limit:${userId}`;
    
    // Increment counter
    let count;
    if (typeof redis.incr === 'function') {
      count = await redis.incr(key);
    } else {
      // Use REST API for Upstash
      count = await redis.incr(key);
    }
    
    // Set expiration on first request
    if (count === 1) {
      if (typeof redis.expire === 'function') {
        await redis.expire(key, limits.window);
      } else {
        await redis.expire(key, limits.window);
      }
    }
    
    // Check if limit exceeded
    if (count > limits.requests) {
      let ttl;
      if (typeof redis.ttl === 'function') {
        ttl = await redis.ttl(key);
      } else {
        ttl = await redis.ttl(key);
      }
      
      return res.status(429).json({
        error: `Rate limit exceeded. ${limits.requests} requests per ${limits.window} seconds allowed for ${tier} tier.`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: ttl,
        limit: limits.requests,
        window: limits.window,
        tier: tier,
      });
    }
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': limits.requests,
      'X-RateLimit-Remaining': Math.max(0, limits.requests - count),
      'X-RateLimit-Reset': Date.now() + (limits.window * 1000),
    });
    
    next();
  } catch (err) {
    console.error('Rate limiter error:', err);
    // Fail open - allow request if rate limiter fails
    next();
  }
};

/**
 * Legacy rate limiter (for backward compatibility)
 */
export const rateLimiter = tieredRateLimiter;

export default tieredRateLimiter;
