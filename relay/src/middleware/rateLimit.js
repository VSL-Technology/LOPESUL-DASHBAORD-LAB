const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
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

    if (bucket.count > max) {
      return res.status(429).json({ ok: false, error: 'Too Many Requests' });
    }

    return next();
  };
}
