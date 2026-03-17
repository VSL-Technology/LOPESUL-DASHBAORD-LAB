function minutesFromSeconds(seconds) {
  if (seconds === null || seconds === undefined) return 0;
  return Math.max(1, Math.ceil(seconds / 60));
}

function buildMessage(status, remainingSeconds) {
  const minutes = minutesFromSeconds(remainingSeconds);
  if (status === 'TRIAL') {
    return `Seu acesso gratuito expira em ${minutes} minuto${minutes === 1 ? '' : 's'}`;
  }

  if (status === 'PAD_BLOCKED' || status === 'BLOCKED') {
    return 'Seu período gratuito terminou. Escolha um plano para continuar';
  }

  if (status === 'PAID') {
    return `Acesso liberado. Seu pacote expira em ${minutes} minuto${minutes === 1 ? '' : 's'}`;
  }

  return 'Estado desconhecido';
}

function buildTrialResponse(state = {}) {
  const status = state.status || 'BLOCKED';
  const remainingSeconds = state.remainingSeconds ?? null;

  const isTrial = status === 'TRIAL';
  const isBlocked = status === 'BLOCKED';

  return {
    status,
    remainingSeconds,
    trialEndsAt: state.trialEndsAt || null,
    paidEndsAt: state.paidEndsAt || null,
    showPaywall: isTrial || isBlocked,
    showTrialBanner: isTrial,
    message: buildMessage(status, remainingSeconds),
  };
}

export { buildTrialResponse };
