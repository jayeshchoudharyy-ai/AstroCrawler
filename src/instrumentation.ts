export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initSelfCron } = await import('@/lib/selfCron');
      await initSelfCron();
    } catch (err) {
      console.error('[Instrumentation] Error initializing Self-Cron:', err);
    }
  }
}
