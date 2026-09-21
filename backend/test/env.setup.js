// Preloaded (via `node --import ./test/env.setup.js --test`) before any test
// file or the modules it imports run. Provides safe dummy values for the env
// vars that some config modules (config/database.js in particular) throw on
// at import time if missing - without this, `import '../server.js'` in a
// test would crash in CI, where there is no backend/.env file (it's
// gitignored on purpose - see backend/.env).
//
// These are deliberately fake/unreachable: tests should never touch a real
// Supabase project, and a request that does hit the (fake) database is
// expected to fail with a connection error, which routes/auth.js already
// handles as a 503 - see test/auth.validation.test.js.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
