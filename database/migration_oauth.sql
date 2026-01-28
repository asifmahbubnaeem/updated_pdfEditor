-- Migration: Add OAuth support to users table
-- Run this in Supabase SQL Editor

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
