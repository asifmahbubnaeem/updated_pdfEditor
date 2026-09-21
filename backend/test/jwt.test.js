import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
} from '../utils/jwt.js';

const payload = { userId: 'user-123', email: 'test@example.com' };

describe('access tokens', () => {
  test('a generated access token verifies back to its payload', () => {
    const token = generateAccessToken(payload);
    const decoded = verifyAccessToken(token);
    assert.equal(decoded.userId, payload.userId);
    assert.equal(decoded.email, payload.email);
  });

  test('rejects a garbage token', () => {
    assert.throws(() => verifyAccessToken('not-a-real-token'), /Invalid token/);
  });

  test('a refresh token cannot be verified as an access token', () => {
    const refreshToken = generateRefreshToken(payload);
    assert.throws(() => verifyAccessToken(refreshToken), /Invalid token/);
  });
});

describe('refresh tokens', () => {
  test('a generated refresh token verifies back to its payload', () => {
    const token = generateRefreshToken(payload);
    const decoded = verifyRefreshToken(token);
    assert.equal(decoded.userId, payload.userId);
  });

  test('an access token cannot be verified as a refresh token', () => {
    const accessToken = generateAccessToken(payload);
    assert.throws(() => verifyRefreshToken(accessToken), /Invalid refresh token/);
  });
});

describe('decodeToken', () => {
  test('decodes payload without verifying signature', () => {
    const token = generateAccessToken(payload);
    const decoded = decodeToken(token);
    assert.equal(decoded.userId, payload.userId);
  });
});
