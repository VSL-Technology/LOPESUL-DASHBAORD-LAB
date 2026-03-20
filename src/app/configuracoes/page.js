"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useSessionInfo } from "@/hooks/useSessionInfo";
import OperadoresManager from "@/components/OperadoresManager";
import AccessDeniedNotice from "@/components/AccessDeniedNotice";

const DUR_OPTIONS = [
  { key: "3h", label: "3 horas", seconds: 3 * 60 * 60 },
  { key: "4h", label: "4 horas", seconds: 4 * 60 * 60 },
  { key: "6h", label: "6 horas", seconds: 6 * 60 * 60 },
  { key: "24h", label: "24 horas", seconds: 24 * 60 * 60 },
  { key: "permanente", label: "Permanente (~100 dias)", seconds: 100 * 24 * 60 * 60 },
];

function secondsToKey(seconds) {
  const found = DUR_OPTIONS.find((item) => item.seconds === seconds);
  return found?.key ?? "4h";
}

export default function ConfiguracoesPage() {
  const { tema, setTema } = useTheme();
  const { loading, isMaster } = useSessionInfo();

  const [nomeOperador, setNomeOperador] = useState("Operador Lopesul");
  const [manutencao, setManutencao] = useState(false);
  const [sessionKey, setSessionKey] = useState("4h");
  const [savingSession, setSavingSession] = useState(false);
  const [updatingMaintenance, setUpdatingMaintenance] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("nomeOperador") || localStorage.getItem("nomeRede");
      if (stored) setNomeOperador(stored);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (!isMaster) return;
    (async () => {
      try {
        const res = await fetch("/api/configuracoes", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setManutencao(Boolean(data?.maintenance));
        setSessionKey(secondsToKey(data?.sessionDefault));
      } catch {
        // mantém defaults locais
      }
    })();
  }, [isMaster]);

  async function salvarSessaoPadrao() {
    const seconds = DUR_OPTIONS.find((opt) => opt.key === sessionKey)?.seconds ?? 4 * 60 * 60;
    setSavingSession(true);
    try {
      const res = await fetch("/api/configuracoes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionDefault: seconds }),
      });
      if (!res.ok) throw new Error();
      alert("Sessão padrão salva com sucesso.");
    } catch {
      alert("Não foi possível salvar a sessão padrão.");
    } finally {
      setSavingSession(false);
    }
  }

  async function toggleManutencao(next) {
    setUpdatingMaintenance(true);
    setManutencao(next);
    try {
      const res = await fetch("/api/configuracoes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maintenance: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setManutencao(!next);
      alert("Falha ao atualizar o modo de manutenção (apenas operadores Master podem alterar).");
    } finally {
      setUpdatingMaintenance(false);
    }
  }

  function salvarPreferenciasLocais(e) {
    e.preventDefault();
    try {
      localStorage.setItem("nomeOperador", nomeOperador);
    } catch {
      // ignore
    }
    alert("Preferências locais salvas.");
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-slate-900/10 p-6 text-center text-slate-500">
          Carregando permissões...
        </div>
      </div>
    );
  }

  if (!isMaster) {
    return (
      <div className="p-6 md:p-8 min-h-screen bg-[#F0F6FA] dark:bg-[#1a2233] flex items-center justify-center">
        <AccessDeniedNotice message="Apenas operadores Master conseguem acessar as configurações avançadas." />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 bg-[#F0F6FA] dark:bg-[#1a2233] min-h-screen transition-colors">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Configurações</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Somente operadores Master podem ajustar estes parâmetros críticos.
        </p>
      </div>

      <div className="space-y-8 max-w-4xl">
        <section className="rounded-2xl border border-slate-700/20 bg-white dark:bg-[#232e47] p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Sessão do Dashboard
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Determine o tempo padrão de login usado quando o formulário não define uma duração
            específica.
          </p>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Duração padrão
          </label>
          <select
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a2233] px-4 py-2 text-sm text-gray-800 dark:text-gray-100"
            value={sessionKey}
            onChange={(e) => setSessionKey(e.target.value)}
          >
            {DUR_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            onClick={salvarSessaoPadrao}
            disabled={savingSession}
          >
            {savingSession ? "Salvando..." : "Salvar sessão padrão"}
          </button>
        </section>

        <section className="rounded-2xl border border-slate-700/20 bg-white dark:bg-[#232e47] p-6 shadow">
          <form onSubmit={salvarPreferenciasLocais} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Nome do Operador
              </label>
              <input
                type="text"
                value={nomeOperador}
                onChange={(e) => setNomeOperador(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a2233] px-4 py-2 text-sm text-gray-800 dark:text-gray-100"
                placeholder="Ex.: Victor Santos"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Tema preferido
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a2233] px-4 py-2 text-sm text-gray-800 dark:text-gray-100"
                value={tema}
                onChange={(e) => setTema(e.target.value)}
              >
                <option value="claro">Claro</option>
                <option value="escuro">Escuro</option>
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Salvar preferências locais
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                Modo de manutenção
              </h2>
              <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                Quando ativo, operadores de leitura entram em modo de manutenção e só conseguem ver o
                aviso. Apenas Master conseguem operar o painel completo.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={manutencao}
                onChange={(e) => toggleManutencao(e.target.checked)}
                disabled={updatingMaintenance}
              />
              <span className="text-sm font-semibold text-amber-900 dark:text-amber-50">
                {manutencao ? "Ativado" : "Desativado"}
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700/20 bg-white dark:bg-[#232e47] p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Operadores
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Crie usuários de leitura ou Master direto desta página segura.
              </p>
            </div>
          </div>
          <OperadoresManager standalone />
        </section>
      </div>
    </div>
  );
}
