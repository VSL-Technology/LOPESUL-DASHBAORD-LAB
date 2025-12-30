'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionInfo } from '@/hooks/useSessionInfo';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'MASTER', label: 'Master (acesso total)' },
  { value: 'READER', label: 'Somente leitura' },
];

export default function OperadoresManager({ standalone = false }) {
  const { role, loading } = useSessionInfo();
  const [operadores, setOperadores] = useState([]);
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [nivel, setNivel] = useState('READER');
  const [modoEdicao, setModoEdicao] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  const nomeRef = useRef(null);

  const podeSalvar = useMemo(() => {
    if (submitting) return false;
    if (modoEdicao) return nome.trim().length > 0;
    return nome.trim().length > 0 && senha.trim().length > 0;
  }, [nome, senha, modoEdicao, submitting]);

  async function fetchOperadores() {
    try {
      setListLoading(true);
      const res = await fetch('/api/operadores', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOperadores(Array.isArray(data) ? data : []);
    } catch {
      setOperadores([]);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (role === 'MASTER') {
      fetchOperadores();
    }
  }, [role]);

  function limpar() {
    setNome('');
    setSenha('');
    setAtivo(true);
    setNivel('READER');
    setModoEdicao(false);
    setEditandoId(null);
  }

  async function handleSalvar() {
    if (!podeSalvar) return;
    setSubmitting(true);
    try {
      const payload = {
        nome: nome.trim(),
        senha: senha.trim(),
        ativo,
        role: nivel,
      };
      const res = await fetch(modoEdicao ? `/api/operadores/${editandoId}` : '/api/operadores', {
        method: modoEdicao ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modoEdicao ? { ...payload, senha: senha.trim() } : payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Falha ao salvar operador');
      }
      limpar();
      fetchOperadores();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExcluir(id) {
    if (!confirm('Deseja excluir este operador?')) return;
    try {
      const res = await fetch(`/api/operadores/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir operador');
      fetchOperadores();
    } catch (err) {
      alert(err.message);
    }
  }

  function iniciarEdicao(op) {
    setNome(op.nome);
    setSenha('');
    setAtivo(Boolean(op.ativo));
    setNivel(op.role || 'READER');
    setModoEdicao(true);
    setEditandoId(op.id);
    setTimeout(() => nomeRef.current?.focus(), 100);
  }

  if (loading || (role !== 'MASTER' && !loading)) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-700 dark:border-slate-600/40 dark:bg-slate-900/40 dark:text-slate-200">
        {loading
          ? 'Carregando permissões...'
          : 'Apenas operadores Master podem gerenciar outros usuários.'}
      </div>
    );
  }

  return (
    <div className={standalone ? '' : 'space-y-6'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSalvar();
        }}
        className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 text-gray-800 md:grid-cols-2 dark:border-slate-700/40 dark:bg-slate-900/40 dark:text-slate-100"
      >
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-700 dark:text-slate-200">Nome do operador</label>
          <input
            ref={nomeRef}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-700 dark:text-slate-200">
            {modoEdicao ? 'Nova senha (opcional)' : 'Senha'}
          </label>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder={modoEdicao ? 'Deixe em branco para manter' : ''}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-700 dark:text-slate-200">Nível</label>
          <select
            value={nivel}
            onChange={(e) => setNivel(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <input
            id="ativo"
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="h-4 w-4"
          />
          <label htmlFor="ativo" className="text-sm text-gray-700 dark:text-slate-200">
            Operador ativo
          </label>
        </div>
        <div className="md:col-span-2 flex gap-3">
          <button
            type="submit"
            disabled={!podeSalvar}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {modoEdicao ? 'Salvar alterações' : 'Cadastrar operador'}
          </button>
          {modoEdicao && (
            <button
              type="button"
              onClick={limpar}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-800 dark:border-slate-600 dark:text-slate-100"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700/40 dark:bg-slate-900/40">
        <div className="mb-4 flex items-center justify-between text-sm text-gray-700 dark:text-slate-300">
          <span>Operadores cadastrados</span>
          {listLoading && <span className="text-xs">Atualizando…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-800 dark:text-slate-200">
            <thead className="text-xs uppercase text-gray-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Nível</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {operadores.map((op) => (
                <tr key={op.id} className="border-t border-gray-200 dark:border-slate-800/60">
                  <td className="px-3 py-2">{op.nome}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                        op.role === 'MASTER'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-600/20 dark:text-emerald-300'
                          : 'bg-slate-200 text-slate-800 dark:bg-slate-600/30 dark:text-slate-200'
                      }`}
                    >
                      {op.role === 'MASTER' ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                      {op.role === 'MASTER' ? 'Master' : 'Leitor'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs font-semibold ${
                        op.ativo ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {op.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-800 dark:border-slate-600 dark:text-slate-100"
                        onClick={() => iniciarEdicao(op)}
                      >
                        Editar
                      </button>
                      <button
                        className="rounded-md border border-red-500/70 px-2 py-1 text-xs text-red-700 dark:text-red-200"
                        onClick={() => handleExcluir(op.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!operadores.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-xs text-gray-500 dark:text-slate-400">
                    Nenhum operador cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
