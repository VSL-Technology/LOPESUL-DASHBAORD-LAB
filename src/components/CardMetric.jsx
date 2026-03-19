"use client";

export default function CardMetric({ title, value, description }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-blue-500/40 bg-gradient-to-br from-blue-900/80 to-blue-800/40 p-6 shadow-[0_10px_40px_rgba(4,8,20,0.6)]">
      <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at top right, rgba(59,130,246,0.4), transparent 45%)' }} />
      <div className="relative">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-200/80">{title}</p>
        <p className="mt-4 text-3xl font-bold text-white sm:text-4xl">{value}</p>
        {description && <p className="mt-1 text-sm text-blue-200/80">{description}</p>}
      </div>
    </div>
  );
}
