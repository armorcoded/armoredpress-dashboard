export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';

export async function GET() {
  try {
    await query('SELECT 1');
    return NextResponse.json({ ok: true, data: { status: 'healthy', ts: new Date().toISOString() } });
  } catch (err) {
    console.error('[health] DB check failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Database unavailable.' },
      { status: 503 },
    );
  }
}
