"use client";

export default function DashboardHeader() {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <p className="text-sm uppercase tracking-[0.4em] text-blue-300/70">Lopesul Wi-Fi Control</p>
      <h1 className="text-3xl font-bold text-white sm:text-4xl">Lopesul Dashboard</h1>
      <p className="text-base text-white/70">Controle de Wi-Fi em tempo real — visão financeira, sessões e saúde do hotspot.</p>
    </div>
  );
}
