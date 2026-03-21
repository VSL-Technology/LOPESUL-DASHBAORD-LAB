"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";

const DASH_REFRESH_MS = 30_000;
const STATUS_REFRESH_MS = 15_000;

const fmtBRL = (value) =>
  Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

function kpiCards(summary) {
  return [
    {
      label: "Receita Hoje",
      value: fmtBRL(summary.receitaHoje),
      color: "border-l-4 border-l-emerald-400 dark:border-l-emerald-500",
      bg: "bg-emerald-50/60 dark:bg-emerald-500/5",
    },
    {
      label: "Receita 30 Dias",
      value: fmtBRL(summary.receita30Dias),
      color: "border-l-4 border-l-blue-400 dark:border-l-blue-500",
      bg: "bg-blue-50/60 dark:bg-blue-500/5",
    },
    {
      label: "Total de Vendas",
      value: summary.totalVendas,
      color: "border-l-4 border-l-violet-400 dark:border-l-violet-500",
      bg: "bg-violet-50/60 dark:bg-violet-500/5",
    },
    {
      label: "Sessões Ativas",
      value: summary.sessoesAtivas,
      color: "border-l-4 border-l-amber-400 dark:border-l-amber-500",
      bg: "bg-amber-50/60 dark:bg-amber-500/5",
    },
    {
      label: "Operadores Ativos",
      value: summary.operadoresAtivos,
      color: "border-l-4 border-l-orange-400 dark:border-l-orange-500",
      bg: "bg-orange-50/60 dark:bg-orange-500/5",
    },
  ];
}

function statusTone(online, messageCode) {
  if (messageCode === "RELAY_NOT_CONFIGURED") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100";
  }
  if (online) {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100";
  }
  return "border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
}

function resolveStatusLabel(item, fallbackLabel) {
  if (item?.messageCode === "RELAY_NOT_CONFIGURED") {
    return "Relay não configurado";
  }
  return item?.online ? "Online" : fallbackLabel;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [summary, setSummary] = useState({
    receitaHoje: 0,
    receita30Dias: 0,
    totalVendas: 0,
    sessoesAtivas: 0,
    operadoresAtivos: 0,
    pagamentos: { pagos: 0, pendentes: 0, expirados: 0 },
    periodo30: null,
  });
  const [status, setStatus] = useState({
    mikrotik: { online: false, nome: null, ip: null, messageCode: null },
    starlink: { online: false, nome: null, ip: null, messageCode: null },
  });

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const [thirtyDaysRes, todayRes] = await Promise.all([
          fetch("/api/dashboard?days=30", { cache: "no-store" }),
          fetch("/api/dashboard?days=1", { cache: "no-store" }),
        ]);

        const [thirtyDaysJson, todayJson] = await Promise.all([
          thirtyDaysRes.json().catch(() => null),
          todayRes.json().catch(() => null),
        ]);

        if (!thirtyDaysRes.ok || !todayRes.ok) {
          throw new Error("Falha ao carregar métricas agregadas.");
        }

        if (cancelled) return;

        setSummary({
          receitaHoje: todayJson?.kpis?.receita ?? 0,
          receita30Dias: thirtyDaysJson?.kpis?.receita ?? 0,
          totalVendas: thirtyDaysJson?.kpis?.qtdVendas ?? 0,
          sessoesAtivas: thirtyDaysJson?.operacao?.sessoesAtivas ?? 0,
          operadoresAtivos: thirtyDaysJson?.operacao?.operadores ?? 0,
          pagamentos: thirtyDaysJson?.kpis?.pagamentos ?? {
            pagos: 0,
            pendentes: 0,
            expirados: 0,
          },
          periodo30: thirtyDaysJson?.periodo ?? null,
        });
        setErro("");
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setErro("Não foi possível carregar os indicadores do dashboard.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    async function loadStatus() {
      try {
        const res = await fetch("/api/status-dispositivos", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error("Falha ao carregar status.");
        }

        if (!cancelled) {
          setStatus({
            mikrotik: {
              online: Boolean(json?.data?.mikrotik?.online ?? json?.mikrotik?.online),
              nome: json?.data?.mikrotik?.nome ?? json?.mikrotik?.nome ?? null,
              ip: json?.data?.mikrotik?.ip ?? json?.mikrotik?.ip ?? null,
              messageCode:
                json?.data?.mikrotik?.messageCode ?? json?.mikrotik?.messageCode ?? null,
            },
            starlink: {
              online: Boolean(json?.data?.starlink?.online ?? json?.starlink?.online),
              nome: json?.data?.starlink?.nome ?? json?.starlink?.nome ?? null,
              ip: json?.data?.starlink?.ip ?? json?.starlink?.ip ?? null,
              messageCode:
                json?.data?.starlink?.messageCode ?? json?.starlink?.messageCode ?? null,
            },
          });
        }
      } catch (error) {
        console.error(error);
      }
    }

    loadDashboard();
    loadStatus();

    const dashInterval = window.setInterval(loadDashboard, DASH_REFRESH_MS);
    const statusInterval = window.setInterval(loadStatus, STATUS_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(dashInterval);
      window.clearInterval(statusInterval);
    };
  }, []);

  const paymentTotal = useMemo(() => {
    const payments = summary.pagamentos ?? {};
    return (payments.pagos ?? 0) + (payments.pendentes ?? 0) + (payments.expirados ?? 0);
  }, [summary.pagamentos]);

  const paymentBars = useMemo(() => {
    const payments = summary.pagamentos ?? {};
    const total = paymentTotal || 1;
    return [
      {
        label: "Pagos",
        value: payments.pagos ?? 0,
        width: `${((payments.pagos ?? 0) / total) * 100}%`,
        color: "bg-emerald-500",
      },
      {
        label: "Pendentes",
        value: payments.pendentes ?? 0,
        width: `${((payments.pendentes ?? 0) / total) * 100}%`,
        color: "bg-amber-400",
      },
      {
        label: "Expirados",
        value: payments.expirados ?? 0,
        width: `${((payments.expirados ?? 0) / total) * 100}%`,
        color: "bg-red-400",
      },
    ];
  }, [paymentTotal, summary.pagamentos]);

  return (
    <ProtectedRoute>
      <div className="text-gray-900 dark:text-[#e2e8f0]">
        <div className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-[#e2e8f0]">Dashboard</h1>
              <p className="text-sm text-gray-500 dark:text-[#94a3b8]">
                Visão executiva consolidada de receita, sessões e status da operação.
              </p>
            </div>
            <div className="text-sm text-gray-500 dark:text-[#94a3b8]">
              {summary.periodo30?.from && summary.periodo30?.to
                ? `Janela 30 dias: ${new Date(summary.periodo30.from).toLocaleDateString("pt-BR")} a ${new Date(
                    summary.periodo30.to
                  ).toLocaleDateString("pt-BR")}`
                : "Janela 30 dias"}
            </div>
          </div>

          {erro ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {erro}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {kpiCards(summary).map((item) => (
              <div
                key={item.label}
                className={`rounded-2xl border border-gray-200 dark:border-gray-700
                ${item.color} ${item.bg}
                p-5 shadow-sm dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)]`}
              >
                <p className="text-sm text-gray-500 dark:text-[#94a3b8]">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 dark:text-[#e2e8f0]">
                  {loading ? "..." : item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e293b] p-6 shadow-sm dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-[#e2e8f0]">Status Geral</h2>
                  <p className="text-sm text-gray-500 dark:text-[#94a3b8]">
                    Indicadores executivos da conectividade central.
                  </p>
                </div>
                <div className="rounded-full border border-blue-300 dark:border-blue-500 bg-blue-100 dark:bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                  Atualização automática
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[
                  {
                    title: "Mikrotik",
                    item: status.mikrotik,
                    fallback: "Offline",
                  },
                  {
                    title: "Starlink",
                    item: status.starlink,
                    fallback: "Offline",
                  },
                ].map(({ title, item, fallback }) => (
                  <div
                    key={title}
                    className={`rounded-2xl border p-5 ${statusTone(item.online, item.messageCode)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-[#94a3b8]">{title}</p>
                        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-[#e2e8f0]">
                          {resolveStatusLabel(item, fallback)}
                        </p>
                      </div>
                      <span className="mt-1 h-3 w-3 rounded-full bg-blue-400" />
                    </div>
                    <div className="mt-4 space-y-1 text-sm text-gray-500 dark:text-[#94a3b8]">
                      <p>{item.nome || "Sem identidade disponível"}</p>
                      <p>{item.ip || "Sem IP disponível"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e293b] p-6 shadow-sm dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)]">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-[#e2e8f0]">Resumo de Vendas</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-[#94a3b8]">Distribuição operacional dos pagamentos.</p>

              <div className="mt-6 space-y-4">
                {paymentBars.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-900 dark:text-[#e2e8f0]">{item.label}</span>
                      <span className="text-gray-500 dark:text-[#94a3b8]">{item.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700">
                      <div className={`h-2 rounded-full ${item.color}`} style={{ width: item.width }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-950/40 p-4">
                <p className="text-sm text-gray-500 dark:text-[#94a3b8]">Receita consolidada</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-[#e2e8f0]">
                  {fmtBRL(summary.receita30Dias)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-[#94a3b8]">Base de 30 dias, sem detalhamento de sessões.</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
