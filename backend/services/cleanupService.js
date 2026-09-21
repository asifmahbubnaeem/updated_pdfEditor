import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * Background sweeper for temp files/directories the PDF-processing routes
 * write to. Several routes already unlink their own output after a
 * successful download, but many leave the *input* upload behind, and a few
 * (delete_action/, rotation_action/) never clean up at all - left running,
 * disk usage grows unbounded. This sweep is the safety net: anything older
 * than TEMP_FILE_TTL_MS in any of these directories gets removed, regardless
 * of whether the route that created it cleaned up after itself.
 */

const TEMP_FILE_TTL_MS = parseInt(process.env.TEMP_FILE_TTL_MS, 10) || 15 * 60 * 1000; // 15 min
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MS, 10) || 10 * 60 * 1000; // 10 min

// Directories are created on-demand by the routes that use them, so they may
// not exist yet at any given time - sweeping just skips missing ones.
const SWEPT_DIRECTORIES = [
  'uploads',
  'extracted',
  'table-extracted',
  'image-extracted',
  'csv-to-pdf',
  'converted_img',
  'merged',
  'delete_action',
  'rotation_action',
  'reorder_action',
  'docx_converted',
  'converted',
];

// encrypt/decrypt/compress write their output straight into the backend's
// working directory (not a subfolder), named by these prefixes.
const ROOT_FILE_PREFIXES = ['encrypted_', 'decrypted_', 'compressed_'];

async function removeIfExpired(entryPath, now) {
  try {
    const stats = await fs.stat(entryPath);
    if (now - stats.mtimeMs > TEMP_FILE_TTL_MS) {
      await fs.rm(entryPath, { recursive: true, force: true });
      logger.info(`Cleanup: removed expired ${entryPath}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn(`Cleanup: failed to remove ${entryPath}: ${err.message}`);
    }
  }
}

async function sweepDirectory(dirName) {
  const dirPath = path.resolve(dirName);
  let entries;
  try {
    entries = await fs.readdir(dirPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn(`Cleanup: failed to read directory ${dirName}: ${err.message}`);
    }
    return;
  }

  const now = Date.now();
  await Promise.all(entries.map((name) => removeIfExpired(path.join(dirPath, name), now)));
}

async function sweepRootFiles() {
  const rootPath = process.cwd();
  let entries;
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch (err) {
    logger.warn(`Cleanup: failed to read backend root directory: ${err.message}`);
    return;
  }

  const now = Date.now();
  const matching = entries.filter(
    (entry) => entry.isFile() && ROOT_FILE_PREFIXES.some((prefix) => entry.name.startsWith(prefix))
  );
  await Promise.all(matching.map((entry) => removeIfExpired(path.join(rootPath, entry.name), now)));
}

export async function runCleanupSweep() {
  await Promise.all([...SWEPT_DIRECTORIES.map(sweepDirectory), sweepRootFiles()]);
}

let intervalHandle = null;

export function startCleanupReaper() {
  if (intervalHandle) return;

  logger.info(
    `Cleanup reaper started: sweeping every ${CLEANUP_INTERVAL_MS / 1000}s, ` +
      `removing anything idle for more than ${TEMP_FILE_TTL_MS / 1000}s`
  );

  runCleanupSweep().catch((err) => logger.error('Cleanup: initial sweep failed:', err));

  intervalHandle = setInterval(() => {
    runCleanupSweep().catch((err) => logger.error('Cleanup: sweep failed:', err));
  }, CLEANUP_INTERVAL_MS);

  // Don't let this timer keep the process alive on its own (e.g. in tests).
  intervalHandle.unref?.();
}

export function stopCleanupReaper() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export default { startCleanupReaper, stopCleanupReaper, runCleanupSweep };
