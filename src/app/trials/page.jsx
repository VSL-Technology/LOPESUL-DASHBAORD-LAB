'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, RefreshCcw, ShieldX } from 'lucide-react';
import { useSessionInfo } from '@/hooks/useSessionInfo';
import AccessDeniedNotice from '@/components/AccessDeniedNotice';

function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatRemaining(minutos) {
  if (minutos == null) return '—';
  if (minutos <= 0) return 'Expirado';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${resto} min`;
}

export default function TrialsPage() {
  const { loading: authLoading, isMaster } = useSessionInfo();
  const [trials, setTrials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadTrials = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const res = await fetch('/api/sessoes?trial=true&limit=150', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data) ? data : data.items || [];
      const nowTs = Date.now();
      const normalized = list.map((item) => {
        const inicio = item.inicioEm ? new Date(item.inicioEm) : null;
        const expira = item.expiraEm ? new Date(item.expiraEm) : null;
        const expiraTs = expira ? expira.getTime() : null;
        const minutosRestantes = expiraTs ? Math.max(-1, Math.round((expiraTs - nowTs) / 60000)) : null;
        const ativo = !!item.ativo && (!expiraTs || expiraTs > nowTs);
        return {
          id: item.id,
          cliente: item.nome || item?.pedido?.customerName || 'Cliente trial',
          ip: item.ipCliente || '—',
          mac: item.macCliente || '—',
          inicio,
          expira,
          minutosRestantes,
          ativo,
        };
      });
      setTrials(normalized);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('[TrialsPage] Erro ao carregar trials', e);
      setError('Não foi possível carregar os clientes em período de trial.');
      setTrials([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isMaster) return;
    loadTrials();
    const interval = setInterval(loadTrials, 20000);
    return () => clearInterval(interval);
  }, [isMaster, loadTrials]);

  useEffect(() => {
    if (!authLoading && !isMaster) {
      setLoading(false);
    }
  }, [authLoading, isMaster]);

  const stats = useMemo(() => {
    const total = trials.length;
    const ativos = trials.filter((t) => t.ativo).length;
    const expiringSoon = trials.filter((t) => t.minutosRestantes != null && t.minutosRestantes > 0 && t.minutosRestantes <= 5).length;
    return { total, ativos, expiringSoon };
  }, [trials]);

  async function handleRevoke(id) {
    if (!confirm('Remover o acesso trial agora?')) return;
    try {
      const res = await fetch(`/api/sessoes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao revogar trial');
      setTrials((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      console.error('[TrialsPage] Erro ao revogar trial', e);
      alert('Não foi possível revogar esta sessão. Verifique os logs do backend.');
    }
  }

  if (authLoading || loading) {
    return (
      <div className="p-6 md:p-8 min-h-screen bg-[#F0F6FA] dark:bg-[#1a2233] flex items-center justify-center text-slate-500">
        Carregando clientes em trial...
      </div>
    );
  }

  if (!isMaster) {
    return (
      <div className="p-6 md:p-8 min-h-screen bg-[#F0F6FA] dark:bg-[#1a2233] flex items-center justify-center">
        <AccessDeniedNotice message="Somente operadores Master podem inspecionar e encerrar sessões de trial." />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 bg-[#F0F6FA] dark:bg-[#1a2233] min-h-screen transition-colors">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Monitorar trials</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Clientes em trial</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadTrials}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-600 dark:text-white dark:hover:bg-slate-800"
          >
            <RefreshCcw size={16} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-[#232e47]">
          <p className="text-sm text-slate-500 dark:text-slate-300">Trials ativos</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{stats.ativos}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-[#232e47]">
          <p className="text-sm text-slate-500 dark:text-slate-300">Total monitorado</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-100">
            <AlertTriangle size={16} />
            Expirando em até 5 min
          </div>
          <p className="mt-2 text-3xl font-bold text-amber-800 dark:text-amber-100">{stats.expiringSoon}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#1f2937]">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
            <Clock3 size={16} />
            Atualizado {lastUpdated ? lastUpdated.toLocaleTimeString() : 'agora'}
          </div>
          <div className="text-xs">
            Se a sessão expirar, o relay removerá o acesso e ela desaparecerá desta lista automaticamente.
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                <th className="px-4 py-3 text-left font-semibold">IP / MAC</th>
                <th className="px-4 py-3 text-left font-semibold">Início</th>
                <th className="px-4 py-3 text-left font-semibold">Expira</th>
                <th className="px-4 py-3 text-left font-semibold">Restante</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {trials.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                    Nenhum cliente em trial neste momento.
                  </td>
                </tr>
              )}
              {trials.map((trial) => {
                const statusColor = trial.ativo
                  ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-100'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200';
                const statusLabel = trial.ativo ? 'Ativo' : 'Encerrado';
                return (
                  <tr key={trial.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-white">{trial.cliente}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">ID sessão {trial.id.slice(0, 8)}...</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900 dark:text-white">{trial.ip}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{trial.mac}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatDate(trial.inicio)}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatDate(trial.expira)}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatRemaining(trial.minutosRestantes)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRevoke(trial.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-500/50 dark:text-red-100 dark:hover:bg-red-500/20"
                      >
                        <ShieldX size={14} />
                        Revogar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
