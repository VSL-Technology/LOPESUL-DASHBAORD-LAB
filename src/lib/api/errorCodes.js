export const ERROR_CODES = Object.freeze({
  UNAUTHORIZED: { status: 401 },
  FORBIDDEN: { status: 403 },
  BAD_REQUEST: { status: 400 },
  NOT_FOUND: { status: 404 },
  RATE_LIMITED: { status: 429 },
  INTERNAL_ERROR: { status: 500 },
  DB_DOWN: { status: 503 },
  UPSTREAM_RELAY_DOWN: { status: 503 },
});

export const ERROR_STATUS_BY_CODE = Object.freeze(
  Object.entries(ERROR_CODES).reduce((acc, [code, config]) => {
    acc[code] = Number(config?.status || 500);
    return acc;
  }, {})
);

export function getErrorStatus(code, fallbackStatus = 500) {
  const normalized = String(code || '').trim().toUpperCase();
  return ERROR_STATUS_BY_CODE[normalized] || Number(fallbackStatus || 500);
}
