'use client';

import { useEffect, useState } from 'react';
import { useSessionInfo } from '@/hooks/useSessionInfo';
import AccessDeniedNotice from '@/components/AccessDeniedNotice';

function statusLabel(s) {
  if (!s) return 'DESCONHECIDO';
  return String(s).toUpperCase();
}

function statusBadgeClasses(status) {
  switch (statusLabel(status)) {
    case 'ONLINE':
      return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
    case 'OFFLINE':
      return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  }
}

export default function RoteadoresPage() {
  const { loading: authLoading, isMaster } = useSessionInfo();
  const [roteadores, setRoteadores] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState({
    nome: '',
    ipLan: '',
    usuario: '',
    senha: '',
    portaApi: '4000',
    portaSsh: '22',
    wgPublicKey: '',
    wgIp: '',
  });
  const [saving, setSaving] = useState(false);
  const [statusExtra, setStatusExtra] = useState({}); // { [id]: { identity, mikrotikOnline, pingOk } }
  const [statusLoading, setStatusLoading] = useState(false);

  async function carregar() {
    try {
      setErro('');
      const res = await fetch('/api/roteadores', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRoteadores(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Erro ao carregar roteadores:', e);
      setErro('Não foi possível carregar os roteadores.');
      setRoteadores([]);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (!isMaster) return;
    carregar();
  }, [isMaster]);

  useEffect(() => {
    if (!isMaster) {
      setListLoading(false);
    }
  }, [isMaster]);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setErro('');
      const res = await fetch('/api/roteadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      setForm({
        nome: '',
        ipLan: '',
        usuario: '',
        senha: '',
        portaApi: '4000',
        portaSsh: '22',
        wgPublicKey: '',
        wgIp: '',
      });
      await carregar();
      await atualizarStatus();
    } catch (e) {
      console.error('Erro ao salvar roteador:', e);
      setErro(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function atualizarStatus() {
    if (!roteadores || roteadores.length === 0) return;
    try {
      setStatusLoading(true);
      const results = await Promise.all(
        roteadores.map(async (r) => {
          try {
            const res = await fetch(`/api/roteadores/${r.id}/status`, {
              cache: 'no-store',
            });
            if (!res.ok) return null;
            const j = await res.json().catch(() => null);
            return { id: r.id, data: j };
          } catch {
            return null;
          }
        })
      );

      const newExtra = {};
      const updatedList = [...roteadores];

      for (const item of results) {
        if (!item || !item.data) continue;
        const { id, data } = item;
        newExtra[id] = {
          identity: data.identity ?? null,
          mikrotikOnline: Boolean(data.mikrotikOnline),
          pingOk: Boolean(data.pingOk),
        };
        // Atualiza statusMikrotik na lista local se vier no payload
        if (data.roteador && data.roteador.statusMikrotik) {
          const idx = updatedList.findIndex((r) => r.id === id);
          if (idx >= 0) {
            updatedList[idx] = {
              ...updatedList[idx],
              statusMikrotik: data.roteador.statusMikrotik,
            };
          }
        }
      }

      setStatusExtra(newExtra);
      setRoteadores(updatedList);
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Tem certeza que deseja remover este roteador?')) return;
    try {
      const res = await fetch(`/api/roteadores/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      setRoteadores((prev) => (prev ?? []).filter((r) => r.id !== id));
      const extraCopy = { ...statusExtra };
      delete extraCopy[id];
      setStatusExtra(extraCopy);
    } catch (e) {
      console.error('Erro ao remover roteador:', e);
      alert('Erro ao remover roteador: ' + String(e?.message || e));
    }
  }

  // Verificação automática a cada 20s
  useEffect(() => {
    if (!roteadores || roteadores.length === 0) return;
    atualizarStatus();
    const t = setInterval(atualizarStatus, 20000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roteadores.length]);

  if (authLoading || listLoading) {
    return (
      <div className="p-6 md:p-8">
        <div className="rounded-2xl bg-slate-900/10 p-6 text-center text-slate-500">
          Carregando roteadores...
        </div>
      </div>
    );
  }

  if (!isMaster) {
    return (
      <div className="p-6 md:p-8 min-h-screen bg-[#F0F6FA] dark:bg-[#1a2233] flex items-center justify-center">
        <AccessDeniedNotice message="Somente operadores Master podem gerenciar roteadores e executar ações críticas." />
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-[#F0F6FA] p-6 transition-colors dark:bg-[#1a2233] md:p-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
          Roteadores (Mikrotiks)
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={atualizarStatus}
            disabled={statusLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow"
          >
            {statusLoading ? 'Verificando...' : 'Atualizar status'}
          </button>
          <a
            href="/roteadores/debug"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
          >
            Debug
          </a>
        </div>
      </div>

      {/* Formulário simples para cadastrar roteador */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
          Novo Roteador
        </h2>
        {erro && (
          <p className="text-sm text-red-500 mb-2">{erro}</p>
        )}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
          {/* campos do formulário (nome, ip, usuário, senhas, wg...) iguais à versão anterior */}
          <div className="flex flex-col">
            <label className="text-gray-700 dark:text-gray-200 mb-1">Nome</label>
            <input
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Onibus_101"
              required
            />
          </div>
          <div className="flex flex-col">
            <label className="text-gray-700 dark:text-gray-200 mb-1">IP LAN / Tunel</label>
            <input
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={form.ipLan}
              onChange={(e) => setForm({ ...form, ipLan: e.target.value })}
              placeholder="10.200.200.2"
              required
            />
          </div>
          <div className="flex flex-col">
            <label className="text-gray-700 dark:text-gray-200 mb-1">Usuário API/SSH</label>
            <input
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={form.usuario}
              onChange={(e) => setForm({ ...form, usuario: e.target.value })}
              placeholder="admin"
              required
            />
          </div>
          <div className="flex flex-col">
            <label className="text-gray-700 dark:text-gray-200 mb-1">Senha</label>
            <input
              type="password"
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col">
            <label className="text-gray-700 dark:text-gray-200 mb-1">Porta API</label>
            <input
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={form.portaApi}
              onChange={(e) => setForm({ ...form, portaApi: e.target.value })}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-gray-700 dark:text-gray-200 mb-1">Porta SSH</label>
            <input
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={form.portaSsh}
              onChange={(e) => setForm({ ...form, portaSsh: e.target.value })}
            />
          </div>
          <div className="flex flex-col md:col-span-2">
            <label className="text-gray-700 dark:text-gray-200 mb-1">WireGuard Public Key</label>
            <input
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={form.wgPublicKey}
              onChange={(e) => setForm({ ...form, wgPublicKey: e.target.value })}
              placeholder="chave pública do Mikrotik"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-gray-700 dark:text-gray-200 mb-1">WireGuard IP (/32)</label>
            <input
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={form.wgIp}
              onChange={(e) => setForm({ ...form, wgIp: e.target.value })}
              placeholder="10.200.200.2/32"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg shadow"
            >
              {saving ? 'Salvando...' : 'Salvar Roteador'}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de roteadores */}
      <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
        Roteadores cadastrados
      </h2>

      {listLoading ? (
        <p className="text-gray-600 dark:text-gray-300">Carregando roteadores...</p>
      ) : (roteadores?.length ?? 0) === 0 ? (
        <p className="text-gray-600 dark:text-gray-300">Nenhum roteador cadastrado.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roteadores.map((r) => {
            const extra = statusExtra[r.id] || {};
            return (
              <div
                key={r.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-md font-semibold text-gray-800 dark:text-white">
                    {r.nome}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
                    className="text-xs text-red-400 hover:text-red-500"
                  >
                    Remover
                  </button>
                </div>
                <p className="text-gray-700 dark:text-gray-200 text-sm">
                  <strong>IP:</strong> {r.ipLan}
                </p>
                <p className="text-gray-700 dark:text-gray-200 text-sm">
                  <strong>Usuário:</strong> {r.usuario}
                </p>
                <p className="text-gray-700 dark:text-gray-200 text-sm">
                  <strong>Porta API:</strong> {r.portaApi}
                </p>
                <p className="text-gray-700 dark:text-gray-200 text-sm">
                  <strong>Status Mikrotik:</strong>{' '}
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClasses(r.statusMikrotik)}`}>
                    {statusLabel(r.statusMikrotik)}
                  </span>
                </p>
                {extra.identity && (
                  <p className="text-gray-600 dark:text-gray-300 text-xs mt-1">
                    <strong>Identity:</strong> {extra.identity}
                  </p>
                )}
                <p className="text-gray-700 dark:text-gray-200 text-sm">
                  <strong>Status WG:</strong> {statusLabel(r.statusWireguard)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
