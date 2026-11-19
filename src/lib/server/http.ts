import type { NextRequest } from 'next/server';

/** Util kecil untuk endpoint server (same-origin, rate limit in-memory). */

export function hasSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // server-to-server (webhook) tidak mengirim Origin
  try {
    const allowedHosts = new Set<string>();
    const requestHost = req.headers.get('host');
    if (requestHost) allowedHosts.add(requestHost);
    try {
      const configured = new URL(process.env.NEXT_PUBLIC_APP_URL || '');
      allowedHosts.add(configured.host);
    } catch {
      // opsional
    }
    return allowedHosts.has(new URL(origin).host);
  } catch {
    return false;
  }
}

const hits = new Map<string, number[]>();

export function isRateLimited(req: NextRequest, bucket: string, maxPerMinute: number): boolean {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) || []).filter((timestamp) => now - timestamp < 60_000);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 2000) {
    // Cegah kebocoran memori pada proses yang berjalan lama.
    Array.from(hits.entries()).forEach(([oldKey, values]) => {
      if (!values.some((timestamp) => now - timestamp < 60_000)) hits.delete(oldKey);
    });
  }
  return list.length > maxPerMinute;
}

export async function readJsonBody(req: NextRequest, maxBytes: number): Promise<unknown | null> {
  const raw = await req.text();
  if (!raw || raw.length > maxBytes) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function asText(value: unknown, max = 120): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
