-- Migration: Track issued refresh tokens for revocation/rotation
-- Run this in Supabase SQL Editor
--
-- Without this table, a refresh token is a bare signed JWT that stays valid
-- until it naturally expires (7 days by default) - logout can't actually
-- invalidate it, and there's no way to detect/stop reuse of a stolen one.
-- Each refresh token now carries a `jti` claim (see backend/utils/jwt.js);
-- this table is the server-side record of which jti's are still valid.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own refresh tokens" ON refresh_tokens
    FOR SELECT USING (auth.uid() = user_id);

-- Note: server-side operations use the Supabase service role key (see
-- backend/config/database.js), which bypasses RLS, same as every other
-- table in this schema.

-- Optional: periodically delete long-expired rows to keep this table small.
-- Run manually or wire up to a scheduled job (e.g. pg_cron, or a periodic
-- call from the backend) - this migration only creates the table.
-- DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '30 days';
