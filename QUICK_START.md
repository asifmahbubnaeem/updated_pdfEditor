# Quick Start Guide - Free Tier Setup

This is a condensed version to get you up and running in 30 minutes.

## Step 1: Create Accounts (10 minutes)

1. **Supabase**: [supabase.com](https://supabase.com) → New Project
2. **Upstash**: [upstash.com](https://upstash.com) → Create Redis Database
3. **Cloudflare**: [cloudflare.com](https://cloudflare.com) → Sign up → R2 → Create Bucket
4. **Railway**: [railway.app](https://railway.app) → Sign up with GitHub

## Step 2: Get Credentials (5 minutes)

### Supabase
- Go to Project Settings → API
- Copy: `Project URL` and `anon public` key
- Copy: `service_role` key (keep secret!)

### Upstash
- Go to your Redis database
- Copy: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

### Cloudflare R2
- Go to R2 → Manage R2 API Tokens → Create API Token
- Copy: `Access Key ID` and `Secret Access Key`
- Note your `Account ID` from dashboard

### Railway
- Will configure after deployment

## Step 3: Set Up Database (5 minutes)

1. Go to Supabase SQL Editor
2. Copy and paste contents of `database/schema.sql`
3. Click "Run"

## Step 4: Configure Environment (5 minutes)

### Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your credentials
```

### Frontend
```bash
cd frontend
cp .env.example .env
# Edit .env with your credentials
```

## Step 5: Install Dependencies (5 minutes)

### Backend
```bash
cd backend
npm install @supabase/supabase-js @aws-sdk/client-s3 @aws-sdk/s3-request-presigner dotenv jsonwebtoken bcryptjs express-validator helmet
```

### Frontend
```bash
cd frontend
npm install @supabase/supabase-js axios
```

## Step 6: Create Configuration Files

The setup guide includes these files - create them as needed:
- `backend/config/database.js`
- `backend/config/redis.js`
- `backend/services/storageService.js`
- `frontend/src/services/api.js`

## Step 7: Deploy to Railway (10 minutes)

1. Push code to GitHub
2. Railway → New Project → Deploy from GitHub
3. Select repository
4. Add environment variables from `.env`
5. Deploy!

## Step 8: Test (5 minutes)

1. Visit your Railway URL
2. Test file upload
3. Check Supabase for usage logs
4. Verify Redis rate limiting

## Troubleshooting

**Can't connect to database?**
- Check Supabase URL and keys
- Verify database is running

**Redis errors?**
- Check Upstash REST URL format
- Verify token is correct

**R2 upload fails?**
- Check CORS configuration
- Verify API credentials
- Check bucket name

**Railway deployment fails?**
- Check build logs
- Verify all environment variables are set
- Check Node.js version (should be 18+)

## Next Steps

1. Read full `FREE_TIER_SETUP_GUIDE.md` for detailed instructions
2. Implement authentication (see production plan)
3. Add payment integration
4. Set up monitoring

## Cost Check

After setup, verify you're on free tier:
- ✅ Supabase: Check usage in dashboard (should be < 500MB)
- ✅ Upstash: Check commands/day (should be < 10K)
- ✅ R2: Check storage (should be < 10GB)
- ✅ Railway: Check usage (should be < 500 hours)

**Expected Cost: $0-5/month** 🎉
