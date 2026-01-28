# Google OAuth Setup Guide

This guide will help you set up Google OAuth authentication for the PDF Editor application.

## Prerequisites

1. A Google Cloud Platform (GCP) account
2. Access to your Supabase database

## Step 1: Create Google OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. If prompted, configure the OAuth consent screen:
   - Choose **External** user type
   - Fill in the required information (App name, User support email, Developer contact)
   - Add your domain to authorized domains
   - Add scopes: `email`, `profile`, `openid`
   - Add test users if in testing mode
6. Create OAuth client ID:
   - Application type: **Web application**
   - Name: PDF Editor (or your preferred name)
   - Authorized JavaScript origins:
     - `http://localhost:5173` (for development)
     - `http://localhost:4173` (for preview)
     - Your production domain (e.g., `https://yourdomain.com`)
   - Authorized redirect URIs:
     - `http://localhost:5173` (for development)
     - `http://localhost:4173` (for preview)
     - Your production domain
7. Click **Create** and copy the **Client ID**

## Step 2: Run Database Migration

1. Open your Supabase dashboard
2. Go to **SQL Editor**
3. Run the migration script from `database/migration_oauth.sql`:

```sql
-- Add OAuth provider columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'local',
ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);

-- Make password_hash nullable (for OAuth users)
ALTER TABLE users 
ALTER COLUMN password_hash DROP NOT NULL;

-- Create index for provider lookups
CREATE INDEX IF NOT EXISTS idx_users_provider_provider_id ON users(provider, provider_id);

-- Add unique constraint for provider + provider_id combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_unique 
ON users(provider, provider_id) 
WHERE provider IS NOT NULL AND provider_id IS NOT NULL;
```

## Step 3: Configure Environment Variables

### Backend (.env)

Add the following to your `backend/.env` file:

```env
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
```

**Note:** The backend uses `GOOGLE_CLIENT_ID` to verify the ID token. The client secret is not strictly needed for ID token verification, but you may want to keep it for other OAuth flows.

### Frontend (.env)

Add the following to your `frontend/.env` file:

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id-here
```

## Step 4: Install Dependencies

### Backend

```bash
cd backend
npm install google-auth-library
```

### Frontend

No additional npm packages needed! The frontend uses Google's Identity Services library loaded from CDN.

## Step 5: Test the Implementation

1. Start your backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. Start your frontend server:
   ```bash
   cd frontend
   npm run dev
   ```

3. Navigate to the login or register page
4. You should see a "Sign in with Google" button
5. Click it and complete the Google sign-in flow
6. You should be redirected and logged in

## Features

- **Automatic Account Linking**: If a user signs up with email/password and later signs in with Google using the same email, their accounts will be linked
- **New User Creation**: New users signing in with Google will have accounts automatically created
- **Email Verification**: Google-verified emails are automatically marked as verified
- **Seamless Integration**: Works alongside existing email/password authentication

## Troubleshooting

### "Google sign-in failed" error

1. Check that `VITE_GOOGLE_CLIENT_ID` is set correctly in frontend `.env`
2. Verify the Google Client ID matches in both frontend and backend
3. Check browser console for detailed error messages
4. Ensure your domain is added to authorized JavaScript origins in Google Cloud Console

### "Invalid token" error

1. Verify `GOOGLE_CLIENT_ID` is set in backend `.env`
2. Ensure the Client ID matches the one used in the frontend
3. Check that the token hasn't expired (they expire after 1 hour)

### Database errors

1. Ensure the migration script has been run successfully
2. Check that the `provider` and `provider_id` columns exist
3. Verify `password_hash` can be NULL

## Security Notes

- Never commit your `.env` files to version control
- Use different OAuth credentials for development and production
- Regularly rotate your OAuth client secrets
- Monitor OAuth usage in Google Cloud Console
