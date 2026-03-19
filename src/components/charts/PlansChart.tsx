"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatCurrencyBRL } from '@/lib/formatCurrency';

type PlanData = { plano: string; total: number; quantidade: number };

export default function PlansChart({ data }: { data?: PlanData[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-blue-500/40 bg-[#132c52]/70 p-6 text-center text-sm text-blue-200/70">
        Sem dados suficientes para mostrar os planos.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-500/40 bg-[#132c52]/70 p-4 shadow-[0_30px_60px_rgba(3,7,24,0.7)]">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-blue-200/70">Distribuição por plano</div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#164172" strokeDasharray="3 3" />
            <XAxis dataKey="plano" tick={{ fill: '#d1e8ff' }} stroke="#0c1b36" />
            <YAxis tickFormatter={(value) => formatCurrencyBRL(value)} tick={{ fill: '#d1e8ff' }} stroke="#0c1b36" />
            <Tooltip
              contentStyle={{ background: '#0b1f3a', borderColor: '#164172' }}
              formatter={(value: number) => formatCurrencyBRL(value)}
            />
            <Bar dataKey="total" fill="#38bdf8" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
