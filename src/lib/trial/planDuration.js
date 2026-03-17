const KNOWN_PLAN_HOURS = {
  "2h": 120,
  "4h": 240,
  "5h": 300,
};

function normalizePlanDescriptor(plan) {
  if (!plan) return "";

  if (typeof plan === "string") {
    return plan.trim().toLowerCase();
  }

  if (typeof plan === "object") {
    const fields = ["plano", "plan", "nome", "name", "descricao", "description"];
    for (const field of fields) {
      const value = plan[field];
      if (typeof value === "string" && value.trim()) {
        return value.trim().toLowerCase();
      }
    }

    if (typeof plan.duration === "number" && Number.isFinite(plan.duration)) {
      return `${plan.duration}h`;
    }

    if (typeof plan.minutes === "number" && Number.isFinite(plan.minutes)) {
      return `${plan.minutes}minutos`;
    }
  }

  return "";
}

function parseHours(descriptor) {
  const hoursRegex = /(\d+(?:[.,]\d+)?)\s*(h|hora|horas)/i;
  const match = descriptor.match(hoursRegex);
  if (!match) return null;

  const numberPart = match[1].replace(",", ".");
  const hours = Number.parseFloat(numberPart);
  if (!Number.isFinite(hours)) return null;
  return Math.round(hours * 60);
}

function parseSimpleDescriptor(descriptor) {
  const cleaned = descriptor.replace(/[^0-9h]/g, "").trim();
  if (KNOWN_PLAN_HOURS[cleaned]) {
    return KNOWN_PLAN_HOURS[cleaned];
  }
  return null;
}

function logUnknown(descriptor) {
  if (!descriptor) return;
  console.info("[planDuration] não foi possível inferir duração a partir de:", descriptor);
}

function getPlanDurationMinutes(plan) {
  const descriptor = normalizePlanDescriptor(plan);
  if (!descriptor) {
    logUnknown("(vazio)");
    return null;
  }

  const parsedByRegex = parseHours(descriptor);
  if (parsedByRegex) return parsedByRegex;

  const parsedSimple = parseSimpleDescriptor(descriptor);
  if (parsedSimple) return parsedSimple;

  logUnknown(descriptor);
  return null;
}

export { getPlanDurationMinutes, normalizePlanDescriptor };
