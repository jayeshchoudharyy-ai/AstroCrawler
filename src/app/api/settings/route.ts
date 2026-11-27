import { NextRequest, NextResponse } from 'next/server';
import {
  getSettings,
  saveSettings,
  formatScheduleDescription,
} from '@/lib/store';
import { rescheduleSelfCron, getSelfCronState } from '@/lib/selfCron';

export const dynamic = 'force-dynamic';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function GET() {
  try {
    const settings = await getSettings();
    const cronStatus = await getSelfCronState();
    return NextResponse.json({
      success: true,
      settings,
      cronStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load settings' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      recipientEmail,
      defaultRazorpayLink,
      automationEnabled,
      automationsPerDay,
      automationTimes,
      timezone,
    } = body;

    const current = await getSettings();
    const nextEnabled =
      typeof automationEnabled === 'boolean'
        ? automationEnabled
        : current.automationEnabled ?? true;

    const nextTimezone =
      typeof timezone === 'string' && timezone.trim()
        ? timezone.trim()
        : current.timezone || 'Asia/Kolkata';

    let nextTimes = current.automationTimes || ['09:00', '21:00'];
    if (Array.isArray(automationTimes)) {
      const valid = automationTimes
        .map((t: any) => String(t).trim())
        .filter((t: string) => TIME_REGEX.test(t));

      if (nextEnabled && valid.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Please provide at least one valid time in HH:MM format.',
          },
          { status: 400 }
        );
      }
      nextTimes = Array.from(new Set(valid)).sort();
    }

    const nextCount =
      typeof automationsPerDay === 'number'
        ? automationsPerDay
        : nextTimes.length;

    const scheduleDescription = formatScheduleDescription(
      nextTimes,
      nextEnabled,
      nextTimezone
    );

    const updated = await saveSettings({
      recipientEmail:
        typeof recipientEmail === 'string' && recipientEmail.trim()
          ? recipientEmail.trim()
          : current.recipientEmail,
      defaultRazorpayLink:
        typeof defaultRazorpayLink === 'string' && defaultRazorpayLink.trim()
          ? defaultRazorpayLink.trim()
          : current.defaultRazorpayLink,
      automationEnabled: nextEnabled,
      automationsPerDay: nextCount,
      automationTimes: nextTimes,
      timezone: nextTimezone,
      scheduleDescription,
    });

    // Live-reschedule node-cron immediately with the new timings & count
    const cronRes = await rescheduleSelfCron();
    const cronStatus = await getSelfCronState();

    return NextResponse.json({
      success: true,
      message: cronRes.message,
      settings: updated,
      cronStatus,
    });
  } catch (error: any) {
    console.error('[API /api/settings] Error saving settings:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save settings' },
      { status: 500 }
    );
  }
}
