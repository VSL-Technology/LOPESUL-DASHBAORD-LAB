const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function coerceBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

const rawTrialDuration = Number(process.env.TRIAL_DURATION_MINUTES ?? 5);
const trialDurationMinutes = Number.isFinite(rawTrialDuration) && rawTrialDuration > 0
  ? Math.round(rawTrialDuration)
  : 5;

const paidWalledGardenOnly = coerceBoolean(process.env.PAID_WALLED_GARDEN_ONLY, false);

export { trialDurationMinutes, paidWalledGardenOnly };
