  import { NextRequest, NextResponse } from 'next/server';
import { executeSelfCron, getSelfCronState, checkAndRunDueSchedule } from '@/lib/selfCron';
import { getStorageBackend } from '@/lib/store';

export const maxDuration = 120; // 120s max execution duration for multi-target crawl + retries
export const dynamic = 'force-dynamic';

/**
 * Self-Hosted Cron API:
 * GET /api/cron: Returns current self-cron scheduler status & upcoming runs
 * GET /api/cron?auto=true: Checks if any UI-configured schedule is due (5-min grace) and runs it
 * GET /api/cron?run=true: Manually executes the self-cron audit run
 * POST /api/cron: Manually triggers the self-cron audit run from the UI or external webhook
 */
export async function GET(req: NextRequest) {
  try {
    const shouldRun = req.nextUrl.searchParams.get('run') === 'true' || 
                      req.nextUrl.searchParams.get('trigger') === 'true';
    const isAutoCheck = req.nextUrl.searchParams.get('auto') === 'true';

    if (shouldRun) {
      const source = req.nextUrl.searchParams.get('source') === 'cron' ? 'cron' : 'manual';
      console.log(`[API /api/cron] Audit trigger requested via GET (source=${source})`);
      const result = await executeSelfCron(source);
      return NextResponse.json(result, { status: result.success ? 200 : 500 });
    }

    if (isAutoCheck) {
      const checkRes = await checkAndRunDueSchedule(5);
      const cronState = await getSelfCronState();
      return NextResponse.json({
        success: true,
        isSelfCron: true,
        autoCheck: checkRes,
        status: cronState,
      });
    }

    const cronState = await getSelfCronState();
    return NextResponse.json({
      success: true,
      isSelfCron: true,
      storageBackend: getStorageBackend(),
      status: cronState,
    });
  } catch (error: any) {
    console.error('[API /api/cron] Error in GET handler:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal error checking cron status' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('[API /api/cron] Manual self-cron trigger requested via POST');
    const result = await executeSelfCron('manual');
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error: any) {
    console.error('[API /api/cron] Error in POST handler:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Cron execution failed' },
      { status: 500 }
    );
  }
}
