"use client";

import { useEffect, useMemo, useState } from "react";
import EChart from "@/components/EChart";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";



function fmtBRL(v) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function iso(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function formatChartLabel(d) {
  const label = typeof d === 'string'
    ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : d instanceof Date
    ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : String(d);

  return label === 'Invalid Date' ? String(d ?? '') : label;
}

export default function RelatoriosPage() {
  const [range, setRange] = useState("30"); // "7", "30", "90"
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const to = useMemo(() => new Date(), []);
  const from = useMemo(() => addDays(to, -Number(range || 30)), [to, range]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        const url = `/api/relatorios?from=${iso(from)}&to=${iso(to)}`;
        const res = await fetch(url, { cache: "no-store" });
        const j = await res.json();
        if (!cancel) setData(j);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [from, to]);


  const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");
  const axisColor = isDark ? "#a3aed0" : "#475569";
  const gridColor = isDark ? "#334155" : "#e5e7eb";

  const vendasPorDia = data?.series?.vendasPorDia ?? [];
  const pagosPorDia = data?.series?.pagosPorDia ?? [];
  const faturamentoPorFrota = data?.faturamentoPorFrota ?? [];

  const vendasLabels = vendasPorDia.map((d) => d.date);
  const vendasVals = vendasPorDia.map((d) => d.total ?? 0);

  const pagosLabels = pagosPorDia.map((d) => d.date);
  const pagosVals = pagosPorDia.map((d) => d.count ?? 0);

  const frotaLabels = faturamentoPorFrota.map((d) => d.nome ?? "Frota");
  const frotaVals = faturamentoPorFrota.map((d) => Math.round(d.total ?? 0));

  
  const lineBase = {
    grid: { left: 40, right: 20, top: 30, bottom: 35 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      boundaryGap: false,
      axisLabel: {
        color: axisColor,
        formatter: (value) => formatChartLabel(value),
      },
      axisLine: { lineStyle: { color: gridColor } },
      data: [],
    },
    yAxis: {
      type: "value",
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: gridColor } },
      splitLine: { show: true, lineStyle: { color: gridColor, type: "dashed" } },
    },
    textStyle: { color: axisColor },
  };

  const vendasOption = {
    ...lineBase,
    xAxis: { ...lineBase.xAxis, data: vendasLabels },
    series: [{ name: "Vendas", type: "line", smooth: true, showSymbol: false, areaStyle: { opacity: 0.08 }, lineStyle: { width: 2 }, data: vendasVals }],
  };

  const pagosOption = {
    ...lineBase,
    xAxis: { ...lineBase.xAxis, data: pagosLabels },
    series: [{ name: "Pagos", type: "line", smooth: true, showSymbol: false, areaStyle: { opacity: 0.08 }, lineStyle: { width: 2 }, data: pagosVals }],
  };

  const barrasOption = {
    grid: { left: 40, right: 20, top: 30, bottom: 40 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmtBRL(v) },
    xAxis: {
      type: "category",
      axisLabel: {
        color: axisColor,
        rotate: frotaLabels.some(n => (n?.length ?? 0) > 12) ? 30 : 0,
        formatter: (value) => formatChartLabel(value),
      },
      axisLine: { lineStyle: { color: gridColor } },
      data: frotaLabels,
    },
    yAxis: {
      type: "value",
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: gridColor } },
      splitLine: { show: true, lineStyle: { color: gridColor, type: "dashed" } },
    },
    textStyle: { color: axisColor },
    series: [{ type: "bar", data: frotaVals, barWidth: 28, itemStyle: { borderRadius: [8, 8, 0, 0] } }],
  };

  const resumo = data?.resumo ?? { totalVendas: 0, receita: 0, mediaTempoAcesso: "0 min", pagamentos: { pagos: 0, pendentes: 0, expirados: 0 } };

  return (
    <div className="p-6 md:p-8 bg-transparent min-h-screen transition-colors">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
            Relatórios e Análises
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Período: {iso(from)} → {iso(to)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1e293b] text-gray-800 dark:text-gray-100"
          >
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
          >
            Exportar PDF
          </button>
        </div>
      </div>

      {/* KPIs com cores suaves */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Vendas (total) — amarelo */}
        <MetricCard
          label="Vendas (total)"
          value={fmtBRL(resumo.totalVendas ?? 0)}
          sub={`${resumo.qtdVendas ?? 0} operações`}
          variant="warning"
        />

        <MetricCard
          label="Pagamentos confirmados"
          value={fmtBRL(resumo.receita ?? 0)}
          sub={`${resumo.pagamentos?.pagos ?? 0} pagos • ${resumo.pagamentos?.pendentes ?? 0} pend. • ${resumo.pagamentos?.expirados ?? 0} exp.`}
          variant="success"
        />

        <MetricCard
          label="Operação"
          value={`${data?.inventario?.frotas ?? 0} frotas / ${data?.inventario?.dispositivos ?? 0} disp.`}
          sub={`${data?.operacao?.operadores ?? 0} oper. • ${data?.operacao?.sessoesAtivas ?? 0} sessões ativas`}
          variant="info"
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="shadow dark:bg-[#111827]" title="Vendas por dia">
          <div className="min-h-[200px] h-[260px] sm:h-[320px]">
            {loading ? (
              <div className="h-full animate-pulse rounded-lg bg-gray-200/50 dark:bg-white/5" />
            ) : (
              <EChart option={vendasOption} height="100%" />
            )}
          </div>
        </Card>

        <Card className="shadow dark:bg-[#111827]" title="Pagamentos confirmados por dia">
          <div className="min-h-[200px] h-[260px] sm:h-[320px]">
            {loading ? (
              <div className="h-full animate-pulse rounded-lg bg-gray-200/50 dark:bg-white/5" />
            ) : pagosPorDia.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                Nenhum dado no período
              </div>
            ) : (
              <EChart option={pagosOption} height="100%" />
            )}
          </div>
        </Card>

        <Card className="shadow dark:bg-[#111827] lg:col-span-2" title="Faturamento por Frota">
          <div className="min-h-[200px] h-[280px] sm:h-[380px]">
            {loading ? (
              <div className="h-full animate-pulse rounded-lg bg-gray-200/50 dark:bg-white/5" />
            ) : (
              <EChart option={barrasOption} height="100%" />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
