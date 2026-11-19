import { NextResponse } from 'next/server';
import { getTelegramRuntimeStats } from '@/lib/telegram/server';

/**
 * GET /api/telegram/stats
 *
 * Statistik runtime pengiriman Telegram (sejak proses server berjalan).
 * Tidak pernah memuat token, chat ID, atau isi pesan.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    stats: getTelegramRuntimeStats(),
    note: 'Dihitung in-memory sejak server berjalan; bukan riwayat persisten.',
  });
}
