"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";

function yyyymmddLocal(date) {
  const dt = new Date(date);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function fmtTempo(min) {
  if (min == null) return "—";
  const hours = Math.floor(min / 60);
  const minutes = Math.max(0, Math.round(min - hours * 60));
  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function diffMin(a, b) {
  return (a - b) / 60000;
}

function statusBadge(status) {
  if (status === "online") {
    return "border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-100";
  }
  if (status === "offline") {
    return "border border-gray-300 bg-gray-100 text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
  }
  return "border border-gray-300 bg-gray-100 text-gray-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300";
}

export default function AcessosPage() {
  const [range, setRange] = useState("24h");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const fetchingRef = useRef(false);

  const { from, to } = useMemo(() => {
    const now = new Date();
    let start = addDays(now, -1);

    if (range === "hoje") {
      start = new Date();
      start.setHours(0, 0, 0, 0);
    }
    if (range === "semana") {
      start = addDays(now, -7);
    }
    if (range === "mes") {
      start = addDays(now, -30);
    }

    return { from: start, to: now };
  }, [range]);

  const loadData = useCallback(
    async (signal) => {
      if (fetchingRef.current) return;

      try {
        fetchingRef.current = true;
        setLoading(true);

        const params = new URLSearchParams();
        params.set("from", yyyymmddLocal(from));
        params.set("to", yyyymmddLocal(to));

        const res = await fetch(`/api/sessoes?${params.toString()}`, {
          cache: "no-store",
          signal,
        });
        const json = await res.json().catch(() => ({}));
        const items = Array.isArray(json) ? json : json.items ?? json.data ?? [];
        const now = new Date();

        setRows(
          items.map((session) => {
            const inicio = session.inicioEm ? new Date(session.inicioEm) : null;
            const expira = session.expiraEm ? new Date(session.expiraEm) : null;
            const expiraTimestamp = expira ? expira.getTime() : null;
            const online = Boolean(session.ativo) && (!expiraTimestamp || expiraTimestamp > now.getTime());

            return {
              id: session.id,
              nome: session.nome || session.macCliente || session.ipCliente || "—",
              ip: session.ipCliente || "—",
              mac: session.macCliente || "—",
              plano: session.plano || "—",
              tempo: inicio && online ? fmtTempo(diffMin(now, inicio)) : "—",
              status: online ? "online" : "offline",
              statusLabel: online ? "Online" : "Offline",
            };
          })
        );

        setLastUpdated(new Date());
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.error("Erro ao carregar sessões:", error);
          setRows([]);
        }
      } finally {
        fetchingRef.current = false;
        setLoading(false);
      }
    },
    [from, to]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const controller = new AbortController();
    const intervalId = window.setInterval(() => loadData(controller.signal), 15_000);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [autoRefresh, loadData]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => {
      return (
        row.nome.toLowerCase().includes(term) ||
        row.ip.toLowerCase().includes(term) ||
        row.mac.toLowerCase().includes(term) ||
        row.plano.toLowerCase().includes(term)
      );
    });
  }, [query, rows]);

  const summary = useMemo(() => {
    const online = filtered.filter((item) => item.status === "online").length;
    return {
      total: filtered.length,
      online,
      offline: Math.max(filtered.length - online, 0),
    };
  }, [filtered]);

  async function encerrar(id) {
    if (!window.confirm("Derrubar esta sessão agora?")) return;

    try {
      const res = await fetch(`/api/sessoes/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Falha ao derrubar sessão.");
      }

      setRows((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, status: "offline", statusLabel: "Offline", tempo: "—" }
            : item
        )
      );
    } catch (error) {
      console.error(error);
      window.alert("Não foi possível derrubar a sessão selecionada.");
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen rounded-3xl bg-white text-gray-900 dark:bg-[#0f172a] dark:text-[#e2e8f0]">
        <div className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Acessos</h1>
              <p className="text-sm text-gray-500 dark:text-[#94a3b8]">
                Central operacional em tempo real para monitorar e encerrar sessões.
              </p>
            </div>
            <div className="text-sm text-gray-500 dark:text-[#94a3b8]">
              {lastUpdated ? `Atualizado às ${lastUpdated.toLocaleTimeString("pt-BR")}` : "Aguardando atualização"}
            </div>
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            {[
              { label: "Sessões", value: summary.total },
              { label: "Online", value: summary.online },
              { label: "Offline", value: summary.offline },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#1e293b] dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)]"
              >
                <p className="text-sm text-gray-500 dark:text-[#94a3b8]">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">{loading ? "..." : item.value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#1e293b] dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="grid flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <input
                  type="text"
                  placeholder="Buscar por nome, IP, MAC ou plano"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-[#e2e8f0]"
                />
                <select
                  value={range}
                  onChange={(event) => setRange(event.target.value)}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-[#e2e8f0]"
                >
                  <option value="24h">Últimas 24h</option>
                  <option value="hoje">Hoje</option>
                  <option value="semana">Esta semana</option>
                  <option value="mes">Este mês</option>
                </select>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-950 dark:text-[#94a3b8]">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                  className="h-4 w-4 accent-blue-500"
                />
                Auto refresh 15s
              </label>
            </div>
          </section>

          <section className="space-y-4">
            <div className="space-y-3 md:hidden">
              {loading ? (
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center text-gray-500 shadow-sm dark:border-slate-800 dark:bg-[#1e293b] dark:text-[#94a3b8] dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)]">
                  Carregando sessões...
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center text-gray-500 shadow-sm dark:border-slate-800 dark:bg-[#1e293b] dark:text-[#94a3b8] dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)]">
                  Nenhuma sessão encontrada para o período selecionado.
                </div>
              ) : (
                filtered.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#1e293b] dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-[#e2e8f0]">{item.nome}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-[#94a3b8]">{item.plano}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusBadge(item.status)}`}>
                        {item.statusLabel}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-700 dark:text-[#cbd5e1]">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-[#94a3b8]">IP</p>
                        <p>{item.ip}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-[#94a3b8]">MAC</p>
                        <p className="break-all">{item.mac}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-[#94a3b8]">Tempo conectado</p>
                        <p>{item.tempo}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => encerrar(item.id)}
                      className="mt-4 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 transition hover:border-blue-500 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-[#e2e8f0] dark:hover:text-blue-100"
                    >
                      Derrubar sessão
                    </button>
                  </article>
                ))
              )}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#1e293b] dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)] md:block">
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-950/70 dark:text-[#94a3b8]">
                  <tr>
                    <th className="px-4 py-4 font-medium">Cliente</th>
                    <th className="px-4 py-4 font-medium">IP</th>
                    <th className="px-4 py-4 font-medium">MAC</th>
                    <th className="px-4 py-4 font-medium">Plano</th>
                    <th className="px-4 py-4 font-medium">Tempo conectado</th>
                    <th className="px-4 py-4 font-medium">Status</th>
                    <th className="px-4 py-4 text-center font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-[#94a3b8]">
                        Carregando sessões...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-gray-500 dark:text-[#94a3b8]">
                        Nenhuma sessão encontrada para o período selecionado.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr key={item.id} className="border-t border-gray-200 dark:border-slate-800/80">
                        <td className="px-4 py-4 text-gray-900 dark:text-[#e2e8f0]">{item.nome}</td>
                        <td className="px-4 py-4 text-gray-700 dark:text-[#cbd5e1]">{item.ip}</td>
                        <td className="px-4 py-4 text-gray-700 dark:text-[#cbd5e1]">{item.mac}</td>
                        <td className="px-4 py-4 text-gray-700 dark:text-[#cbd5e1]">{item.plano}</td>
                        <td className="px-4 py-4 text-gray-700 dark:text-[#cbd5e1]">{item.tempo}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusBadge(item.status)}`}>
                            {item.statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => encerrar(item.id)}
                            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 transition hover:border-blue-500 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-[#e2e8f0] dark:hover:text-blue-100"
                          >
                            Derrubar sessão
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </div>
          </section>
        </div>
      </div>
    </ProtectedRoute>
  );
}
