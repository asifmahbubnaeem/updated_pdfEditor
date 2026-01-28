import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Configuration for Redis connection
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
};

// For Upstash REST API (better for free tier with rate limits)
export const redisRest = {
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
};

// Redis REST API helper functions (for Upstash free tier)
export const redisRestClient = {
  async get(key) {
    if (!redisRest.url || !redisRest.token) {
      throw new Error('Upstash Redis REST credentials not configured');
    }

    const encodedKey = encodeURIComponent(key);
    const response = await fetch(`${redisRest.url}/get/${encodedKey}`, {
      headers: {
        'Authorization': `Bearer ${redisRest.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Redis REST API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result;
  },

  async set(key, value, expirationSeconds = null) {
    if (!redisRest.url || !redisRest.token) {
      throw new Error('Upstash Redis REST credentials not configured');
    }

    // Encode key and value for URL
    const encodedKey = encodeURIComponent(key);
    const encodedValue = encodeURIComponent(value);
    
    const url = expirationSeconds
      ? `${redisRest.url}/set/${encodedKey}/${encodedValue}/ex/${expirationSeconds}`
      : `${redisRest.url}/set/${encodedKey}/${encodedValue}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisRest.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Redis REST API error: ${response.statusText}`);
    }

    return await response.json();
  },

  async incr(key) {
    if (!redisRest.url || !redisRest.token) {
      throw new Error('Upstash Redis REST credentials not configured');
    }

    const response = await fetch(`${redisRest.url}/incr/${key}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisRest.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Redis REST API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result;
  },

  async expire(key, seconds) {
    if (!redisRest.url || !redisRest.token) {
      throw new Error('Upstash Redis REST credentials not configured');
    }

    const response = await fetch(`${redisRest.url}/expire/${key}/${seconds}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisRest.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Redis REST API error: ${response.statusText}`);
    }

    return await response.json();
  },

  async ttl(key) {
    if (!redisRest.url || !redisRest.token) {
      throw new Error('Upstash Redis REST credentials not configured');
    }

    const response = await fetch(`${redisRest.url}/ttl/${key}`, {
      headers: {
        'Authorization': `Bearer ${redisRest.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Redis REST API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result;
  },

  async del(key) {
    if (!redisRest.url || !redisRest.token) {
      throw new Error('Upstash Redis REST credentials not configured');
    }

    const response = await fetch(`${redisRest.url}/del/${key}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisRest.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Redis REST API error: ${response.statusText}`);
    }

    return await response.json();
  },
};

// Direct Redis connection (for Railway Redis or self-hosted)
// Use REDIS_URL if available, otherwise use config
let redis = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  // Use REST API wrapper for Upstash (preferred for free tier)
  redis = {
    get: redisRestClient.get.bind(redisRestClient),
    set: redisRestClient.set.bind(redisRestClient),
    incr: redisRestClient.incr.bind(redisRestClient),
    expire: redisRestClient.expire.bind(redisRestClient),
    ttl: redisRestClient.ttl.bind(redisRestClient),
    del: redisRestClient.del.bind(redisRestClient),
  };
  console.log('Using Upstash Redis REST API');
} else if (process.env.REDIS_URL) {
  // Use Redis URL (for Railway, Heroku, etc.)
  redis = new Redis(process.env.REDIS_URL, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });
  console.log('Using Redis URL connection');
} else {
  // Fallback to local Redis
  redis = new Redis(redisConfig);
  console.log('Using local Redis connection');
}

// Error handling
if (redis && typeof redis.on === 'function') {
  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  redis.on('connect', () => {
    console.log('Redis connected successfully');
  });
}

export default redis;
