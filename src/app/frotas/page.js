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
    return "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }
  if (status === "online") {
    return "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300";
  }
  return "border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-300";
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
      <div className="min-h-screen rounded-3xl bg-white text-gray-900 dark:bg-[#0f172a] dark:text-[#e2e8f0]">
        <div className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Frotas</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Visão agrupada por ônibus, com receita, sessões ativas e status do Mikrotik.
              </p>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{rows.length} ônibus monitorados</div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Receita Total", value: formatBRL(summary.receita) },
              { label: "Sessões Ativas", value: summary.sessoes },
              { label: "Mikrotiks Online", value: summary.online },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <p className="text-sm text-gray-500 dark:text-gray-400">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">{loading ? "..." : item.value}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Carregando frotas...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((frota) => (
                <article
                  key={frota.id}
                  className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Bus ID</p>
                      <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
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
                    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/50">
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Receita total</p>
                      <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
                        {formatBRL(frota.valorTotal)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/50">
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Sessões ativas</p>
                      <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
                        {Number(frota.sessoesAtivas ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 text-sm text-gray-500 dark:text-gray-400">
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
