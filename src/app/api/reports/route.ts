import { NextResponse } from 'next/server';
import { getReports } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const reports = await getReports();
    return NextResponse.json({ success: true, reports });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}
