const MAC_REGEX = /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i;
const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function normalizeMacAddress(value) {
  if (!value) return null;
  const cleaned = String(value).trim().toUpperCase().replace(/-/g, ':');
  return MAC_REGEX.test(cleaned) ? cleaned : null;
}

function isValidMacAddress(value) {
  return Boolean(normalizeMacAddress(value));
}

function normalizeIpAddress(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  return IPV4_REGEX.test(cleaned) ? cleaned : null;
}

function isValidIpAddress(value) {
  return Boolean(normalizeIpAddress(value));
}

export { normalizeMacAddress, isValidMacAddress, normalizeIpAddress, isValidIpAddress };
