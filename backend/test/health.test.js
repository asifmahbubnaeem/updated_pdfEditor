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

describe('GET /api/health', () => {
  test('reports ok status with an uptime', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.uptime, 'number');
    assert.equal(typeof body.timestamp, 'string');
  });
});

describe('unknown routes', () => {
  test('return a 404 with route info instead of crashing', async () => {
    const res = await fetch(`${baseUrl}/api/this-route-does-not-exist`);
    assert.equal(res.status, 404);

    const body = await res.json();
    assert.equal(body.error, 'Route not found');
    assert.equal(body.path, '/api/this-route-does-not-exist');
  });
});
