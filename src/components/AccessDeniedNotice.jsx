'use client';

import { Lock, Shield } from 'lucide-react';

export default function AccessDeniedNotice({
  title = 'Acesso restrito',
  message = 'Você precisa de permissão especial para acessar esta área.',
}) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200/40 bg-white/95 px-6 py-10 text-center shadow dark:border-white/10 dark:bg-[#1f2937]">
      <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-slate-900 text-white shadow-xl dark:bg-slate-100 dark:text-slate-900">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <Shield size={52} strokeWidth={1.4} />
          <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white shadow-lg dark:bg-red-500">
            <Lock size={18} strokeWidth={1.6} />
          </div>
        </div>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{message}</p>
    </div>
  );
}
