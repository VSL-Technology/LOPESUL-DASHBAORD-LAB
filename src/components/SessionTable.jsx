"use client";

export default function SessionTable({ sessions = [], loading = false, onKick }) {
  const empty = !loading && sessions.length === 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-blue-500/40 bg-gradient-to-br from-slate-900/30 to-slate-900/70 shadow-[0_30px_60px_rgba(2,6,23,0.8)]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-white/80">
          <thead className="border-b border-blue-500/40 text-xs uppercase tracking-[0.3em] text-blue-200/70">
            <tr>
              <th className="px-4 py-3">Session ID</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Tempo restante</th>
              <th className="px-4 py-3">Ação</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-white/60">
                  Carregando sessões…
                </td>
              </tr>
            )}
            {!loading && empty && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-white/60">
                  Nenhuma sessão ativa
                </td>
              </tr>
            )}
            {!loading && !empty &&
              sessions.map((session) => (
                <tr key={session.sessionId || session.id || session.ip} className="border-b border-blue-500/20 even:bg-white/5">
                  <td className="px-4 py-3 font-mono text-xs text-white">{session.sessionId || session.id}</td>
                  <td className="px-4 py-3">{session.ip || session.ipCliente || '—'}</td>
                  <td className="px-4 py-3 capitalize">{session.status || 'unknown'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${session.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/80'}`}>
                      {session.active ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{session.plan || '—'}</td>
                  <td className="px-4 py-3">{session.remaining || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onKick?.(session.sessionId || session.id)}
                      className="rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 px-3 py-1 text-xs font-semibold text-slate-900 shadow-[0_10px_30px_rgba(59,130,246,0.35)]"
                    >
                      Derrubar
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
