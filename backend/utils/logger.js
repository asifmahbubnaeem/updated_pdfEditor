// Lightweight structured logger - drop-in replacement for console.log/warn/error.
//
// Deliberately keeps the same variadic call signature as console.* (logger.info(a, b, c))
// so every existing call site can be mechanically switched over without rewriting
// arguments. In production it emits one JSON line per call (safe for log
// aggregators); in development it prints a timestamped, human-readable line.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const currentLevelName = process.env.LOG_LEVEL || 'info';
const currentLevel = LEVELS[currentLevelName] ?? LEVELS.info;
const isProd = process.env.NODE_ENV === 'production';

function toJsonLine(level, args) {
  const [first, ...rest] = args;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: typeof first === 'string' ? first : undefined,
  };

  const extra = typeof first === 'string' ? rest : args;
  if (extra.length === 1) {
    entry.data = extra[0] instanceof Error ? { message: extra[0].message, stack: extra[0].stack } : extra[0];
  } else if (extra.length > 1) {
    entry.data = extra;
  }

  return JSON.stringify(entry);
}

function log(level, args) {
  if (LEVELS[level] < currentLevel) return;

  const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';

  if (isProd) {
    console[consoleMethod](toJsonLine(level, args));
    return;
  }

  const prefix = `[${new Date().toISOString()}] ${level.toUpperCase()}:`;
  console[consoleMethod](prefix, ...args);
}

export const logger = {
  debug: (...args) => log('debug', args),
  info: (...args) => log('info', args),
  warn: (...args) => log('warn', args),
  error: (...args) => log('error', args),
};

export default logger;
