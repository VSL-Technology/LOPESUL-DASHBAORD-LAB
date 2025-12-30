// src/lib/security/rateLimiter.js

const buckets = new Map();

export function enforceRateLimit(
  key,
  { windowMs = 60_000, max = 10 } = {}
) {
  const now = Date.now();
  const bucket = buckets.get(key) || {
    count: 0,
    expiresAt: now + windowMs,
  };

  if (now > bucket.expiresAt) {
    bucket.count = 0;
    bucket.expiresAt = now + windowMs;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  return bucket.count <= max;
}
