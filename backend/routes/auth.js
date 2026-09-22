import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { OAuth2Client } from 'google-auth-library';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, decodeToken } from '../utils/jwt.js';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { logUsage } from '../services/usageTrackingService.js';

/** True if the error is a DB/network unreachable (timeout, DNS, connection refused). */
function isDbUnreachable(error) {
  const msg = (error?.message || '') + (error?.details || '') + (error?.code || '');
  return (
    /fetch failed|CONNECT_TIMEOUT|UND_ERR_CONNECT_TIMEOUT|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(msg)
  );
}

/**
 * Issues a fresh access+refresh token pair for a user and persists the
 * refresh token's jti (see database/migration_refresh_tokens.sql) so it can
 * later be revoked or rotated - a bare signed JWT alone can't be.
 */
async function issueTokenPair(user) {
  const tokenPayload = { userId: user.id, email: user.email };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  const { jti, exp } = decodeToken(refreshToken);
  await db.createRefreshToken({
    jti,
    userId: user.id,
    expiresAt: new Date(exp * 1000).toISOString(),
  });

  return { accessToken, refreshToken };
}

function sendDbUnreachable(res, logLabel, error) {
  console.error(`${logLabel}:`, error?.message || error);
  res.status(503).json({
    error: 'Service temporarily unavailable',
    code: 'SERVICE_UNAVAILABLE',
    message: 'Database is unreachable. Check your connection and Supabase URL, then try again.',
  });
}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = express.Router();

/**
 * Register new user
 * POST /api/auth/register
 */
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/[A-Za-z]/)
      .withMessage('Password must contain at least one letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain at least one number'),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { email, password } = req.body;

      // Check if user already exists
      const existingUser = await db.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          error: 'User with this email already exists',
          code: 'USER_EXISTS',
        });
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const user = await db.createUser({
        email,
        password_hash: passwordHash,
        subscription_tier: 'free',
        subscription_status: 'active',
        email_verified: false,
      });

      // Create initial quota
      await db.getOrCreateQuota(user.id);

      // Generate tokens
      const { accessToken, refreshToken } = await issueTokenPair(user);

      // Remove password hash from response
      const { password_hash, ...userWithoutPassword } = user;

      res.status(201).json({
        message: 'User registered successfully',
        user: userWithoutPassword,
        token: accessToken,
        refreshToken: refreshToken,
      });
    } catch (error) {
      if (isDbUnreachable(error)) {
        return sendDbUnreachable(res, 'Registration error', error);
      }
      console.error('Registration error:', error);
      res.status(500).json({
        error: 'Registration failed',
        message: error.message,
      });
    }
  }
);

/**
 * Login user
 * POST /api/auth/login
 */
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { email, password } = req.body;

      // Find user
      const user = await db.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        });
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        });
      }

      // Generate tokens
      const { accessToken, refreshToken } = await issueTokenPair(user);

      // Log login (optional)
      await logUsage(user.id, 'login', 0, true, req);

      // Remove password hash from response
      const { password_hash, ...userWithoutPassword } = user;

      res.json({
        message: 'Login successful',
        user: userWithoutPassword,
        token: accessToken,
        refreshToken: refreshToken,
      });
    } catch (error) {
      if (isDbUnreachable(error)) {
        return sendDbUnreachable(res, 'Login error', error);
      }
      console.error('Login error:', error);
      res.status(500).json({
        error: 'Login failed',
        message: error.message,
      });
    }
  }
);

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const { password_hash, ...userWithoutPassword } = req.user;
    res.json({
      user: userWithoutPassword,
    });
  } catch (error) {
    if (isDbUnreachable(error)) {
      return sendDbUnreachable(res, 'Get user error', error);
    }
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: error.message,
    });
  }
});

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token is required',
        code: 'REFRESH_TOKEN_MISSING',
      });
    }

    // Verify signature and expiry
    const decoded = verifyRefreshToken(refreshToken);

    // Check server-side revocation state - this is what actually lets
    // logout/rotation invalidate a refresh token before its JWT expiry.
    const tokenRecord = await db.getRefreshToken(decoded.jti);
    if (!tokenRecord || tokenRecord.revoked_at) {
      return res.status(401).json({
        error: 'Refresh token has been revoked',
        code: 'REFRESH_TOKEN_REVOKED',
      });
    }

    // Get user
    const user = await db.getUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    // Rotate: this refresh token is single-use - revoke it and issue a
    // fresh pair, so a leaked-then-reused token is a detectable/stoppable
    // event rather than silently valid for its full 7-day lifetime.
    await db.revokeRefreshToken(decoded.jti);
    const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user);

    res.json({
      token: accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    if (isDbUnreachable(error)) {
      return sendDbUnreachable(res, 'Refresh token error', error);
    }
    console.error('Refresh token error:', error);
    res.status(401).json({
      error: 'Invalid or expired refresh token',
      code: 'INVALID_REFRESH_TOKEN',
    });
  }
});

/**
 * Logout user
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    // Revoke the refresh token so it can't be used again even though the
    // (still short-lived) access token stays valid until it naturally
    // expires. Best-effort: an already-invalid/expired/missing refresh
    // token shouldn't block logout itself.
    const { refreshToken } = req.body;
    if (refreshToken) {
      try {
        const decoded = verifyRefreshToken(refreshToken);
        await db.revokeRefreshToken(decoded.jti);
      } catch (revokeError) {
        console.error('Logout: failed to revoke refresh token:', revokeError?.message || revokeError);
      }
    }

    res.json({
      message: 'Logout successful',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error.message,
    });
  }
});

/**
 * Google OAuth login/signup
 * POST /api/auth/google
 */
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        error: 'Google ID token is required',
        code: 'MISSING_TOKEN',
      });
    }

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, email_verified, name, picture } = payload;

    if (!email) {
      return res.status(400).json({
        error: 'Email not provided by Google',
        code: 'NO_EMAIL',
      });
    }

    // Check if user exists by Google provider ID
    let user = await db.getUserByProviderId('google', googleId);

    if (!user) {
      // Check if user exists by email (might have signed up with email/password)
      const existingUser = await db.getUserByEmail(email);
      
      if (existingUser) {
        // Link Google account to existing user
        user = await db.updateUser(existingUser.id, {
          provider: 'google',
          provider_id: googleId,
          email_verified: email_verified || existingUser.email_verified,
        });
      } else {
        // Create new user
        user = await db.createUser({
          email,
          provider: 'google',
          provider_id: googleId,
          password_hash: null, // OAuth users don't have passwords
          subscription_tier: 'free',
          subscription_status: 'active',
          email_verified: email_verified || false,
        });

        // Create initial quota
        await db.getOrCreateQuota(user.id);
      }
    }

    // Generate tokens
    const { accessToken, refreshToken } = await issueTokenPair(user);

    // Log login
    await logUsage(user.id, 'login', 0, true, req);

    // Remove password hash from response
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      message: 'Google authentication successful',
      user: userWithoutPassword,
      token: accessToken,
      refreshToken: refreshToken,
    });
  } catch (error) {
    if (isDbUnreachable(error)) {
      return sendDbUnreachable(res, 'Google OAuth error', error);
    }
    console.error('Google OAuth error:', error);
    res.status(500).json({
      error: 'Google authentication failed',
      message: error.message,
    });
  }
});

export default router;
