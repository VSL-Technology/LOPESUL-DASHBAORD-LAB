// src/lib/plans.js
export const PLANS = {
  "12H": { minutes: 12 * 60, label: "12 horas" },
  "24H": { minutes: 24 * 60, label: "24 horas" },
  "48H": { minutes: 48 * 60, label: "48 horas" },
};

export function assertPlanId(planId) {
  if (!Object.prototype.hasOwnProperty.call(PLANS, planId)) {
    throw new Error("Plano inválido");
  }
}
