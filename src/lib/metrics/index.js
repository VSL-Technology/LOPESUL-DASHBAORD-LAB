const metrics = {
  api: {},
};

export function recordApiMetric(name, { durationMs = 0, ok = true } = {}) {
  if (!name) return;
  if (!metrics.api[name]) {
    metrics.api[name] = {
      count: 0,
      errors: 0,
      lastDurationMs: 0,
      avgDurationMs: 0,
    };
  }
  const item = metrics.api[name];
  item.count += 1;
  if (!ok) item.errors += 1;
  item.lastDurationMs = durationMs;
  item.avgDurationMs =
    item.avgDurationMs + (durationMs - item.avgDurationMs) / item.count;
}

export function getApiMetrics() {
  return {
    api: metrics.api,
    ts: Date.now(),
  };
}
