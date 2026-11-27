import { NextRequest, NextResponse } from 'next/server';
import { getTargets, addTarget, updateTarget, deleteTarget, getSettings, saveSettings } from '@/lib/store';

export async function GET() {
  try {
    const targets = await getTargets();
    const settings = await getSettings();
    return NextResponse.json({ success: true, targets, settings });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch targets' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, expectedRazorpayLink, name } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // Basic URL validation
    try {
      new URL(url.trim());
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format. Include http:// or https://' },
        { status: 400 }
      );
    }

    const settings = await getSettings();
    const target = await addTarget({
      url: url.trim(),
      name: name?.trim() || new URL(url.trim()).hostname,
      expectedRazorpayLink: (expectedRazorpayLink || settings.defaultRazorpayLink).trim(),
      isActive: true,
    });

    return NextResponse.json({ success: true, target });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create target' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, updates, settings: newSettings } = body;

    if (newSettings) {
      const updatedSettings = await saveSettings(newSettings);
      return NextResponse.json({ success: true, settings: updatedSettings });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'Target ID required' }, { status: 400 });
    }

    const updated = await updateTarget(id, updates);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Target not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, target: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update target' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Target ID required' }, { status: 400 });
    }

    const success = await deleteTarget(id);
    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete target' },
      { status: 500 }
    );
  }
}
