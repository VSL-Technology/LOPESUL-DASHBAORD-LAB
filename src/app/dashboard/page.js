"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";

const DASH_REFRESH_MS = 30_000;
const STATUS_REFRESH_MS = 15_000;

const fmtBRL = (value) =>
  Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

function kpiCards(summary) {
  return [
    { label: "Receita Hoje", value: fmtBRL(summary.receitaHoje), variant: "info" },
    { label: "Receita 30 Dias", value: fmtBRL(summary.receita30Dias), variant: "default" },
    { label: "Total de Vendas", value: summary.totalVendas, variant: "success" },
    { label: "Sessões Ativas", value: summary.sessoesAtivas, variant: "default" },
    { label: "Operadores Ativos", value: summary.operadoresAtivos, variant: "warning" },
  ];
}

function statusTone(online, messageCode) {
  if (messageCode === "RELAY_NOT_CONFIGURED") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200";
  }
  if (online) {
    return "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200";
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
        color: "bg-blue-500",
      },
      {
        label: "Pendentes",
        value: payments.pendentes ?? 0,
        width: `${((payments.pendentes ?? 0) / total) * 100}%`,
        color: "bg-slate-500",
      },
      {
        label: "Expirados",
        value: payments.expirados ?? 0,
        width: `${((payments.expirados ?? 0) / total) * 100}%`,
        color: "bg-slate-700",
      },
    ];
  }, [paymentTotal, summary.pagamentos]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen rounded-3xl bg-white text-gray-900 dark:bg-[#0f172a] dark:text-[#e2e8f0]">
        <div className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Visão executiva consolidada de receita, sessões e status da operação.
              </p>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {kpiCards(summary).map((item) => (
              <MetricCard
                key={item.label}
                label={item.label}
                value={loading ? "..." : item.value}
                variant={item.variant}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card
              className="shadow-sm"
              title="Status Geral"
              subtitle="Indicadores executivos da conectividade central."
            >
              <div className="flex items-center justify-between">
                <div className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-100">
                  Atualização automática
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    className={`min-w-0 rounded-2xl border p-5 ${statusTone(item.online, item.messageCode)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
                        {item.messageCode === "RELAY_NOT_CONFIGURED" ? (
                          <span className="mt-2 inline-flex rounded bg-amber-100 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            Relay não configurado
                          </span>
                        ) : (
                          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                            {resolveStatusLabel(item, fallback)}
                          </p>
                        )}
                      </div>
                      <span className="mt-1 h-3 w-3 rounded-full bg-blue-400" />
                    </div>
                    <div className="mt-4 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                      <p>{item.nome || "Sem identidade disponível"}</p>
                      <p>{item.ip || "Sem IP disponível"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              className="shadow-sm"
              title="Resumo de Vendas"
              subtitle="Distribuição operacional dos pagamentos."
            >
              <div className="mt-6 space-y-4">
                {paymentBars.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-900 dark:text-white">{item.label}</span>
                      <span className="text-gray-500 dark:text-gray-400">{item.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-900">
                      <div className={`h-2 rounded-full ${item.color}`} style={{ width: item.width }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-sm text-gray-500 dark:text-gray-400">Receita consolidada</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {fmtBRL(summary.receita30Dias)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Base de 30 dias, sem detalhamento de sessões.</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
