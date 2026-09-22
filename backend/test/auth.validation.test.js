import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function postJson(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// These exercise the express-validator rules in routes/auth.js, which run
// (and reject) before any database call is made - so they're safe to run
// against the fake Supabase URL set up in test/env.setup.js.
describe('POST /api/auth/register validation', () => {
  test('rejects an invalid email', async () => {
    const res = await postJson('/api/auth/register', { email: 'not-an-email', password: 'abc12345' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Validation failed');
  });

  test('rejects a password with no digit', async () => {
    const res = await postJson('/api/auth/register', { email: 'user@example.com', password: 'abcdefgh' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Validation failed');
  });

  test('rejects a password shorter than 8 characters', async () => {
    const res = await postJson('/api/auth/register', { email: 'user@example.com', password: 'ab12345' });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/auth/login validation', () => {
  test('rejects a missing password', async () => {
    const res = await postJson('/api/auth/login', { email: 'user@example.com' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Validation failed');
  });

  test('rejects an invalid email', async () => {
    const res = await postJson('/api/auth/login', { email: 'not-an-email', password: 'whatever' });
    assert.equal(res.status, 400);
  });
});

// With SUPABASE_URL pointed at an address nothing is listening on (see
// test/env.setup.js), a validly-shaped request should still fail past
// validation and surface as a clean "database unreachable" response, not a
// crash or a generic 500 - this is the isDbUnreachable() path in auth.js.
describe('POST /api/auth/register with an unreachable database', () => {
  test('returns 503 SERVICE_UNAVAILABLE instead of crashing', async () => {
    const res = await postJson('/api/auth/register', {
      email: 'newuser@example.com',
      password: 'validPass1',
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, 'SERVICE_UNAVAILABLE');
  });
});
