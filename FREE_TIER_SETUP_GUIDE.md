# Free-Tier Infrastructure Setup Guide

This guide will help you set up a production-ready PDF editor application using free-tier services, keeping costs at **$0-10/month** for the initial launch phase.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Service Setup](#service-setup)
4. [Backend Configuration](#backend-configuration)
5. [Frontend Configuration](#frontend-configuration)
6. [Database Setup](#database-setup)
7. [Deployment](#deployment)
8. [Cost Monitoring](#cost-monitoring)
9. [Migration Path](#migration-path)

---

## 🎯 Overview

### Free-Tier Stack (Month 1-3: $0-5/month)

| Service | Provider | Free Tier Limits | Cost |
|---------|----------|------------------|------|
| **Database** | Supabase | 500MB, 2GB bandwidth | $0/month |
| **Redis** | Upstash | 10K commands/day | $0/month |
| **Storage** | Cloudflare R2 | 10GB storage, 1M requests | $0/month |
| **Compute** | Railway | 500 hours/month | $0/month |
| **CDN** | Cloudflare | Unlimited bandwidth | $0/month |
| **Domain** | Namecheap/Cloudflare | - | ~$1.25/month |

**Total: ~$1-5/month**

---

## 📦 Prerequisites

Before starting, ensure you have:
- Node.js 18+ installed
- Git installed
- A GitHub account
- Basic terminal/command line knowledge

---

## 🔧 Service Setup

### 1. Supabase (Database) - FREE

**Step 1: Create Account**
1. Go to [supabase.com](https://supabase.com)
2. Sign up with GitHub
3. Create a new project
4. Choose a region closest to your users
5. Set a database password (save it securely!)

**Step 2: Get Connection Details**
1. Go to Project Settings → Database
2. Copy the connection string (URI format)
3. Note your project URL and anon key

**Step 3: Create Database Schema**
Run the SQL script provided in `database/schema.sql` (we'll create this)

**Free Tier Limits:**
- 500MB database storage
- 2GB bandwidth/month
- 50K monthly active users
- Unlimited API requests

---

### 2. Upstash (Redis) - FREE

**Step 1: Create Account**
1. Go to [upstash.com](https://upstash.com)
2. Sign up with GitHub
3. Create a new Redis database
4. Choose the same region as your Supabase project

**Step 2: Get Connection Details**
1. Copy the REST URL
2. Copy the REST Token
3. Note: For ioredis, use the Redis URL format

**Free Tier Limits:**
- 10,000 commands/day
- 256MB max memory
- 10 databases

---

### 3. Cloudflare R2 (File Storage) - FREE

**Step 1: Create Account**
1. Go to [cloudflare.com](https://cloudflare.com)
2. Sign up for free account
3. Go to R2 → Create bucket
4. Name your bucket (e.g., `pdfeditor-uploads`)

**Step 2: Get API Credentials**
1. Go to R2 → Manage R2 API Tokens
2. Create API token with read/write permissions
3. Save Access Key ID and Secret Access Key

**Step 3: Configure CORS**
1. Go to your bucket → Settings → CORS
2. Add CORS configuration (see `config/r2-cors.json`)

**Free Tier Limits:**
- 10GB storage
- 1M Class A operations/month
- 10M Class B operations/month
- No egress fees

---

### 4. Railway (Hosting) - FREE

**Step 1: Create Account**
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Install Railway CLI: `npm i -g @railway/cli`

**Step 2: Create Project**
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Connect your repository

**Step 3: Configure Environment Variables**
Add all environment variables in Railway dashboard

**Free Tier Limits:**
- $5 credit/month (500 hours on $0.01/hour instance)
- Automatic HTTPS
- Custom domains

**Alternative: Fly.io (Also Free)**
- 3 shared VMs free
- 160GB outbound data transfer
- Global edge network

---

### 5. Cloudflare (CDN & DNS) - FREE

**Step 1: Add Domain**
1. Sign up at [cloudflare.com](https://cloudflare.com)
2. Add your domain
3. Update nameservers at your domain registrar

**Step 2: Configure DNS**
1. Add A record pointing to Railway/Fly.io IP
2. Enable proxy (orange cloud)
3. Enable SSL/TLS (Full mode)

**Free Tier Includes:**
- Unlimited bandwidth
- DDoS protection
- SSL certificates
- CDN caching
- Analytics

---

## 🗄️ Database Setup

### Create Database Schema

After setting up Supabase, run this SQL in the SQL Editor:

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  subscription_tier VARCHAR(20) DEFAULT 'free',
  subscription_status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255),
  tier VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  start_date TIMESTAMP DEFAULT NOW(),
  end_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Usage logs table
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  operation_type VARCHAR(50) NOT NULL,
  file_size BIGINT,
  success BOOLEAN DEFAULT true,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

-- User quotas table
CREATE TABLE user_quotas (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_operations INTEGER DEFAULT 0,
  monthly_operations INTEGER DEFAULT 0,
  reset_date DATE DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id)
);

-- Transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  payment_provider VARCHAR(20),
  provider_transaction_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

---

## ⚙️ Backend Configuration

### 1. Install Required Dependencies

```bash
cd backend
npm install @supabase/supabase-js @aws-sdk/client-s3 dotenv jsonwebtoken bcryptjs express-validator helmet
```

### 2. Create Environment File

Create `backend/.env.example`:

```env
# Server
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# Supabase (Database)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
REDIS_URL=redis://default:password@host:port

# Cloudflare R2 (S3 Compatible)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=pdfeditor-uploads
R2_PUBLIC_URL=https://your-bucket.r2.dev

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Stripe (for later)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (optional - for later)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 3. Update Redis Configuration

Create `backend/config/redis.js`:

```javascript
import Redis from 'ioredis';

// Use Upstash REST API for free tier (more efficient)
// Or use ioredis with Redis URL for direct connection

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  // For Upstash, use the Redis URL format
  // url: process.env.REDIS_URL
};

// For Upstash REST API (better for free tier)
export const redisRest = {
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
};

// For direct Redis connection (if using Railway Redis or self-hosted)
export const redis = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL)
  : new Redis(redisConfig);

export default redis;
```

### 4. Create Supabase Client

Create `backend/config/database.js`:

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for server-side

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Helper functions
export const db = {
  // Users
  async getUserById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async getUserByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async createUser(userData) {
    const { data, error } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Usage tracking
  async logUsage(usageData) {
    const { data, error } = await supabase
      .from('usage_logs')
      .insert(usageData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getDailyUsage(userId) {
    const today = new Date().toISOString().split('T')[0];
    const { count, error } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', today);
    if (error) throw error;
    return count || 0;
  }
};

export default db;
```

### 5. Create R2 Storage Service

Create `backend/services/storageService.js`:

```javascript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 is S3-compatible
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

export const storageService = {
  async uploadFile(fileBuffer, fileName, userId, contentType = 'application/pdf') {
    const key = `uploads/${userId}/${Date.now()}-${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    return key;
  },

  async getSignedUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  },

  async deleteFile(key) {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
  },

  getPublicUrl(key) {
    // If you set up a custom domain for R2
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  }
};

export default storageService;
```

---

## 🎨 Frontend Configuration

### 1. Install Required Dependencies

```bash
cd frontend
npm install @supabase/supabase-js axios
```

### 2. Create Environment File

Create `frontend/.env.example`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:3000
VITE_STRIPE_PUBLIC_KEY=pk_test_...
```

### 3. Create API Client

Create `frontend/src/services/api.js`:

```javascript
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## 🚀 Deployment

### Railway Deployment

1. **Connect Repository**
   - Go to Railway dashboard
   - New Project → Deploy from GitHub
   - Select your repository

2. **Configure Backend Service**
   - Add environment variables from `.env`
   - Set root directory to `backend`
   - Set start command: `npm start`
   - Railway will auto-detect Node.js

3. **Configure Frontend Service**
   - Add new service → Deploy from GitHub
   - Set root directory to `frontend`
   - Set build command: `npm run build`
   - Set start command: `npm run preview`
   - Add environment variables

4. **Get Deployment URL**
   - Railway provides HTTPS URL automatically
   - Update CORS settings in backend
   - Update frontend API URL

### Alternative: Fly.io Deployment

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch app (backend)
cd backend
fly launch
fly secrets set SUPABASE_URL=...
# Add all secrets

# Deploy
fly deploy
```

---

## 💰 Cost Monitoring

### Set Up Alerts

1. **Railway**
   - Set spending limit: $5/month
   - Enable email alerts

2. **Cloudflare**
   - Monitor R2 usage in dashboard
   - Set up alerts at 80% of free tier

3. **Supabase**
   - Monitor database size
   - Set up alerts at 400MB (80% of 500MB)

### Track Usage

Create a simple dashboard to track:
- Daily active users
- API requests per day
- Storage used
- Database size

---

## 📈 Migration Path

### When to Upgrade (Growth Milestones)

**100-500 users/month:**
- Upgrade Railway to Hobby plan ($5/month)
- Keep Supabase free tier
- **New Cost: ~$5-10/month**

**500-1,000 users/month:**
- Upgrade Supabase to Pro ($25/month)
- Upgrade Upstash if needed ($10/month)
- **New Cost: ~$40-50/month**

**1,000-5,000 users/month:**
- Consider AWS migration
- Add read replicas
- **New Cost: ~$100-200/month**

**5,000+ users/month:**
- Full production stack
- Load balancing
- **New Cost: ~$200-400/month**

---

## ✅ Checklist

- [ ] Set up Supabase account and database
- [ ] Set up Upstash Redis
- [ ] Set up Cloudflare R2 bucket
- [ ] Set up Railway account
- [ ] Configure domain with Cloudflare
- [ ] Create database schema
- [ ] Configure backend environment variables
- [ ] Configure frontend environment variables
- [ ] Deploy backend to Railway
- [ ] Deploy frontend to Railway
- [ ] Test all endpoints
- [ ] Set up monitoring alerts
- [ ] Test file uploads to R2
- [ ] Verify Redis rate limiting works
- [ ] Test database queries

---

## 🆘 Troubleshooting

### Common Issues

**Redis Connection Failed:**
- Check Upstash REST URL and token
- Verify network connectivity
- Check rate limits (10K/day)

**R2 Upload Failed:**
- Verify CORS configuration
- Check API credentials
- Verify bucket name

**Database Connection Failed:**
- Check Supabase URL and keys
- Verify database password
- Check connection pooling limits

**Railway Deployment Failed:**
- Check build logs
- Verify environment variables
- Check Node.js version compatibility

---

## 📚 Additional Resources

- [Supabase Docs](https://supabase.com/docs)
- [Upstash Docs](https://docs.upstash.com)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2)
- [Railway Docs](https://docs.railway.app)
- [Fly.io Docs](https://fly.io/docs)

---

**Next Steps:** Follow the implementation guide in `PRODUCTION_IMPLEMENTATION.md` to add authentication, payments, and subscription features.
