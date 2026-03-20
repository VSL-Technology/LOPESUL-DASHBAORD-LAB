// src/instrumentation.js
// Next.js instrumentation hook to initialize background services
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export function register() {
  // Only run on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamically import to avoid loading on client side
    import('./lib/scheduler.js').then((mod) => {
      mod.ensureScheduler();
      console.log('[instrumentation] Scheduler initialized');
    }).catch((err) => {
      console.error('[instrumentation] Failed to initialize scheduler:', err);
    });
  }
}
