import { NextResponse } from 'next/server';
import { getTelegramStatus } from '@/lib/telegram/server';

/**
 * GET /api/telegram/status
 *
 * Menampilkan status konfigurasi TANPA token atau chat id.
 * Berguna untuk memastikan environment sudah terbaca oleh server.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(getTelegramStatus());
}
