'use strict';

/**
 * compression.js — response compression middleware
 *
 * Applies gzip/deflate/br compression to all API responses via the `compression`
 * npm package (wraps Node's built-in zlib).
 *
 * Configuration (via environment variables):
 *
 *   COMPRESSION_THRESHOLD   Minimum response body size in bytes before
 *                           compression is applied. Default: 1024 (1 KB).
 *                           Responses smaller than this pass through unchanged.
 *
 *   COMPRESSION_LEVEL       zlib compression level, 1 (fastest) to 9 (best).
 *                           Default: -1 (zlib default, a balance of speed/ratio).
 *
 * Responses that are never compressed:
 *   - Responses below COMPRESSION_THRESHOLD bytes
 *   - Server-Sent Event streams  (text/event-stream)
 *   - Responses that already carry a Content-Encoding header
 *   - The `Cache-Control: no-transform` directive (respected automatically)
 *
 * Usage (in index.js):
 *   const compressionMiddleware = require('./middleware/compression');
 *   app.use(compressionMiddleware);
 */

const compression = require('compression');

/** Minimum bytes before compression kicks in */
const THRESHOLD = parseInt(process.env.COMPRESSION_THRESHOLD || '1024', 10);

/** zlib level: -1 = library default (~6), range 1–9 */
const LEVEL = parseInt(process.env.COMPRESSION_LEVEL || '-1', 10);

/**
 * Custom filter — SSE streams must never be compressed because the chunked
 * encoding breaks the event-stream framing.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean}
 */
function shouldCompress(req, res) {
  // Never compress Server-Sent Event streams
  if (res.getHeader('Content-Type') === 'text/event-stream') {
    return false;
  }
  // Fall back to the library's default filter for everything else
  return compression.filter(req, res);
}

const compressionMiddleware = compression({
  filter: shouldCompress,
  threshold: THRESHOLD,
  level: LEVEL,
});

module.exports = compressionMiddleware;
