"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import CardMetric from '@/components/CardMetric';
import DashboardHeader from '@/components/DashboardHeader';
import SessionTable from '@/components/SessionTable';
import RevenueChart from '@/components/charts/RevenueChart';
import PlansChart from '@/components/charts/PlansChart';
import { formatCurrencyBRL } from '@/lib/formatCurrency';

const sampleSessions = [
  {
    sessionId: "sess-01",
    ip: "10.200.200.101",
    status: "authorized",
    active: true,
    plan: "12h",
    remaining: "10m",
  },
  {
    sessionId: "sess-02",
    ip: "10.200.200.102",
    status: "expired",
    active: false,
    plan: "24h",
    remaining: "0m",
  },
  {
    sessionId: "sess-03",
    ip: "10.200.200.103",
    status: "authorized",
    active: true,
    plan: "48h",
    remaining: "38m",
  },
];

export default function DashboardClient() {
  const [sessions, setSessions] = useState(sampleSessions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [financeData, setFinanceData] = useState(null);
  const [financeLoading, setFinanceLoading] = useState(true);
  const [financeError, setFinanceError] = useState(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", { cache: "no-cache" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.sessions)) {
          setSessions(data.sessions);
          setError(null);
          return;
        }
        throw new Error(data.error || "invalid_response");
      }
      throw new Error(`status_${res.status}`);
    } catch (err) {
      console.warn("Não foi possível carregar /api/sessions", err);
      setError("Não foi possível carregar as sessões. Verifique o Relay.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFinance = useCallback(async () => {
    setFinanceLoading(true);
    try {
      const res = await fetch('/api/finance', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`status_${res.status}`);
      const parsed = await res.json();
      if (parsed.ok) {
        setFinanceData(parsed);
        setFinanceError(null);
        return;
      }
      throw new Error(parsed.error || 'finance_error');
    } catch (err) {
      console.error('finance.fetch.error', err);
      setFinanceError('Não foi possível carregar os dados financeiros.');
    } finally {
      setFinanceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  useEffect(() => {
    fetchFinance();
  }, [fetchFinance]);

  const handleKick = useCallback(async (sessionId) => {
    try {
      const res = await fetch("/api/sessions/kick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) throw new Error("kick_failed");
      fetchSessions();
    } catch (err) {
      console.error("Falha ao derrubar sessão", err);
      setError("Não foi possível derrubar a sessão.");
    }
  }, [fetchSessions]);

  const cards = useMemo(() => {
    const data = financeData?.data;
    return [
      { title: "Receita Hoje", value: formatCurrencyBRL(data?.receitaHoje ?? 0), description: "Baseado em vendas confirmadas" },
      { title: "Receita Total", value: formatCurrencyBRL(data?.receitaMes ?? 0), description: "Últimos 30 dias" },
      { title: "Sessões Ativas", value: data?.sessoesAtivas ?? 0 },
      { title: "Total de Sessões", value: data?.totalSessoes ?? 0 },
    ];
  }, [financeData]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0b1f3a] text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
          <DashboardHeader />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <CardMetric
                key={card.title}
                title={card.title}
                value={card.value}
                description={card.description}
              />
            ))}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-blue-500/40 bg-[#132c52]/80 p-6 shadow-[0_30px_60px_rgba(3,7,24,0.7)]">
              <h2 className="text-lg font-semibold text-white">Sessões em tempo real</h2>
              <p className="text-sm text-blue-200/70">Atualizado automaticamente a cada 5 segundos.</p>
              {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <RevenueChart data={financeData?.data?.vendasPorDia} />
              <PlansChart data={financeData?.data?.vendasPorPlano} />
            </div>
            <SessionTable sessions={sessions} loading={loading} onKick={handleKick} />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
