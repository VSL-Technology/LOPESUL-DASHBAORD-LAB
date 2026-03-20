"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";

function formatBRL(value) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.frotas)) return data.frotas;
  return [];
}

function statusClasses(status, messageCode) {
  if (messageCode === "RELAY_NOT_CONFIGURED") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-100";
  }
  if (status === "online") {
    return "border-blue-500/30 bg-blue-500/10 text-blue-100";
  }
  return "border-slate-700 bg-slate-950/60 text-slate-300";
}

function statusLabel(status, messageCode) {
  if (messageCode === "RELAY_NOT_CONFIGURED") {
    return "Relay não configurado";
  }
  return status === "online" ? "Online" : "Offline";
}

export default function FrotasPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchFrotas() {
      try {
        const res = await fetch("/api/frotas", { cache: "no-store" });
        const json = await res.json().catch(() => []);
        if (!res.ok) {
          throw new Error("Falha ao carregar frotas.");
        }

        if (!cancelled) {
          setRows(normalizeRows(json));
        }
      } catch (error) {
        console.error("Erro ao buscar frotas:", error);
        if (!cancelled) {
          setRows([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchFrotas();
    const intervalId = window.setInterval(fetchFrotas, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, item) => {
        acc.receita += Number(item?.valorTotal ?? 0);
        acc.sessoes += Number(item?.sessoesAtivas ?? 0);
        if (item?.statusMikrotik === "online") acc.online += 1;
        return acc;
      },
      { receita: 0, sessoes: 0, online: 0 }
    );
  }, [rows]);

  return (
    <ProtectedRoute>
      <div className="text-gray-900 dark:text-[#e2e8f0]">
        <div className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Frotas</h1>
              <p className="text-sm text-gray-500 dark:text-[#94a3b8]">
                Visão agrupada por ônibus, com receita, sessões ativas e status do Mikrotik.
              </p>
            </div>
            <div className="text-sm text-gray-500 dark:text-[#94a3b8]">{rows.length} ônibus monitorados</div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Receita Total", value: formatBRL(summary.receita) },
              { label: "Sessões Ativas", value: summary.sessoes },
              { label: "Mikrotiks Online", value: summary.online },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e293b] p-5 shadow-sm dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)]"
              >
                <p className="text-sm text-gray-500 dark:text-[#94a3b8]">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">{loading ? "..." : item.value}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e293b] px-6 py-10 text-center text-gray-500 dark:text-[#94a3b8] shadow-sm dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)]">
              Carregando frotas...
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((frota) => (
                <article
                  key={frota.id}
                  className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e293b] p-6 shadow-sm dark:shadow-[0_10px_30px_rgba(15,23,42,0.35)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-[#94a3b8]">Bus ID</p>
                      <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-[#e2e8f0]">
                        {frota.busId || frota.nome || "Sem identificação"}
                      </h2>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusClasses(
                        frota.statusMikrotik,
                        frota.messageCode
                      )}`}
                    >
                      {statusLabel(frota.statusMikrotik, frota.messageCode)}
                    </span>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-gray-50 dark:bg-slate-950/50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-[#94a3b8]">Receita total</p>
                      <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-[#e2e8f0]">
                        {formatBRL(frota.valorTotal)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 dark:bg-slate-950/50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-[#94a3b8]">Sessões ativas</p>
                      <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-[#e2e8f0]">
                        {Number(frota.sessoesAtivas ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 text-sm text-gray-500 dark:text-[#94a3b8]">
                    <p>{frota.mikrotikIdentity || "Sem identidade de roteador"}</p>
                    <p>{frota.mikrotikHost || "Sem host de Mikrotik"}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
