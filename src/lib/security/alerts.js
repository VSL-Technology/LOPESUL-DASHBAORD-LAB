export function alertCritical(message, data) {
  // Simple alert sink for critical events — prints to stderr for now.
  // Intentionally minimal: later integration with Slack/Email/Webhook can be added.
  console.error('[ALERTA CRÍTICO]', message, data || {});
}

export default alertCritical;
