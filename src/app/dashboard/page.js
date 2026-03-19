"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import CardMetric from '@/components/CardMetric';
import DashboardHeader from '@/components/DashboardHeader';
import SessionTable from '@/components/SessionTable';

const fmtBRL = (value) =>
  value?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "R$ 0,00";

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

export default function DashboardPage() {
  const [sessions, setSessions] = useState(sampleSessions);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    receitaHoje: 9900,
    receitaTotal: 129870,
    sessoesAtivas: 32,
    sessoesTotais: 128,
  });

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/session/active", { cache: "no-cache" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sessions)) {
          setSessions(data.sessions);
        }
      }
    } catch (error) {
      console.warn("Não foi possível carregar /session/active", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const handleKick = useCallback(async (sessionId) => {
    try {
      await fetch("/session/kick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      fetchSessions();
    } catch (error) {
      console.error("Falha ao derrubar sessão", error);
    }
  }, [fetchSessions]);

  const cards = useMemo(() => [
    { title: "Receita Hoje", value: fmtBRL(kpis.receitaHoje), description: "Baseado em vendas confirmadas" },
    { title: "Receita Total", value: fmtBRL(kpis.receitaTotal), description: "Últimos 30 dias" },
    { title: "Sessões Ativas", value: kpis.sessoesAtivas },
    { title: "Total de Sessões", value: kpis.sessoesTotais },
  ], [kpis]);

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

          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-500/40 bg-[#132c52]/80 p-6 shadow-[0_30px_60px_rgba(3,7,24,0.7)]">
              <h2 className="text-lg font-semibold text-white">Sessões em tempo real</h2>
              <p className="text-sm text-blue-200/70">Atualizado automaticamente a cada 5 segundos.</p>
            </div>
            <SessionTable sessions={sessions} loading={loading} onKick={handleKick} />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
