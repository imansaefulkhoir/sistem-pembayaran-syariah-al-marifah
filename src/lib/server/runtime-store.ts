import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  GatewayConfirmedEvent,
  GatewayPaymentIntent,
  GuardianTelegramLinkRecord,
  TelegramDeliveryStatus,
} from '../types';

/**
 * PENYIMPANAN RUNTIME SERVER (MODE DEMO).
 *
 * Aplikasi utama masih memakai localStorage di browser. Endpoint server
 * (webhook gateway, tautan Telegram, penyimpanan PDF) memerlukan penyimpanan
 * yang dapat diakses lintas request, sehingga memakai file JSON di folder
 * `data/runtime`. Saat Supabase aktif, ganti modul ini dengan query database.
 *
 * Tidak ada token bot / secret yang pernah ditulis ke file data ini.
 */

const DATA_DIR = process.env.ALMARIFAH_DATA_DIR || path.join(process.cwd(), 'data', 'runtime');
const RECEIPTS_DIR = path.join(DATA_DIR, 'receipts');

const LINK_FILE = path.join(DATA_DIR, 'telegram-links.json');
const OUTBOX_FILE = path.join(DATA_DIR, 'telegram-outbox.json');
const INTENTS_FILE = path.join(DATA_DIR, 'payment-intents.json');
const EVENTS_FILE = path.join(DATA_DIR, 'gateway-events.json');
const PROCESSED_FILE = path.join(DATA_DIR, 'processed-keys.json');
const RECEIPT_META_FILE = path.join(DATA_DIR, 'receipt-files.json');

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

// --------------------------------------------------------------------------
// Tautan Telegram wali
// --------------------------------------------------------------------------

interface LinkFile {
  links: GuardianTelegramLinkRecord[];
}

export async function createTelegramLinkCode(
  guardianId: string,
  guardianName: string,
  notificationsEnabled = true
): Promise<GuardianTelegramLinkRecord> {
  const data = await readJson<LinkFile>(LINK_FILE, { links: [] });
  const now = Date.now();
  const active = data.links.filter(
    (link) => link.guardianId !== guardianId && new Date(link.codeExpiresAt).getTime() > now
  );
  const code = randomBytes(6).toString('hex').toUpperCase().slice(0, 10);
  const record: GuardianTelegramLinkRecord = {
    guardianId,
    guardianName,
    code,
    codeExpiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
    notificationsEnabled,
  };
  data.links = [record, ...active];
  await writeJson(LINK_FILE, data);
  return record;
}

export async function getTelegramLinkByCode(code: string): Promise<GuardianTelegramLinkRecord | undefined> {
  const data = await readJson<LinkFile>(LINK_FILE, { links: [] });
  return data.links.find((link) => link.code.toUpperCase() === code.trim().toUpperCase());
}

export async function getTelegramLinkByGuardian(guardianId: string): Promise<GuardianTelegramLinkRecord | undefined> {
  const data = await readJson<LinkFile>(LINK_FILE, { links: [] });
  return data.links.find((link) => link.guardianId === guardianId && link.telegramUserId);
}

export async function linkTelegramAccount(
  code: string,
  telegramUserId: string,
  telegramUsername?: string
): Promise<{ ok: boolean; error?: string; record?: GuardianTelegramLinkRecord }> {
  if (!/^\d{4,20}$/.test(telegramUserId)) {
    return { ok: false, error: 'Telegram numeric user ID tidak valid.' };
  }
  const data = await readJson<LinkFile>(LINK_FILE, { links: [] });
  const record = data.links.find((link) => link.code.toUpperCase() === code.trim().toUpperCase());
  if (!record) return { ok: false, error: 'Kode tautan tidak ditemukan.' };
  if (new Date(record.codeExpiresAt).getTime() < Date.now()) {
    return { ok: false, error: 'Kode tautan sudah kedaluwarsa.' };
  }
  // Satu akun Telegram hanya boleh terhubung ke satu akun wali.
  data.links = data.links.filter(
    (link) => link.telegramUserId !== telegramUserId || link.guardianId === record.guardianId
  );
  const updated: GuardianTelegramLinkRecord = {
    ...record,
    telegramUserId,
    telegramUsername: telegramUsername?.replace(/^@/, '').slice(0, 64),
    linkedAt: new Date().toISOString(),
  };
  data.links = data.links.map((link) => (link.guardianId === record.guardianId ? updated : link));
  await writeJson(LINK_FILE, data);
  return { ok: true, record: updated };
}

export async function unlinkTelegramByUserId(telegramUserId: string): Promise<boolean> {
  const data = await readJson<LinkFile>(LINK_FILE, { links: [] });
  const before = data.links.length;
  data.links = data.links.filter((link) => link.telegramUserId !== telegramUserId);
  await writeJson(LINK_FILE, data);
  return data.links.length !== before;
}

// --------------------------------------------------------------------------
// Outbox notifikasi Telegram
// --------------------------------------------------------------------------

export interface TelegramOutboxEntry {
  key: string;
  guardianId?: string;
  telegramUserId?: string;
  status: TelegramDeliveryStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  receiptAttached: boolean;
  fallbackLinkUsed: boolean;
}

interface OutboxFile {
  entries: TelegramOutboxEntry[];
}

export async function getOutboxEntry(key: string): Promise<TelegramOutboxEntry | undefined> {
  const data = await readJson<OutboxFile>(OUTBOX_FILE, { entries: [] });
  return data.entries.find((entry) => entry.key === key);
}

export async function upsertOutboxEntry(
  key: string,
  patch: Partial<TelegramOutboxEntry> & { status: TelegramDeliveryStatus }
): Promise<TelegramOutboxEntry> {
  const data = await readJson<OutboxFile>(OUTBOX_FILE, { entries: [] });
  const existing = data.entries.find((entry) => entry.key === key);
  const now = new Date().toISOString();
  const entry: TelegramOutboxEntry = {
    key,
    status: patch.status,
    attempts: patch.attempts ?? existing?.attempts ?? 0,
    lastError: patch.lastError ?? existing?.lastError,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deliveredAt: patch.deliveredAt ?? existing?.deliveredAt,
    receiptAttached: patch.receiptAttached ?? existing?.receiptAttached ?? false,
    fallbackLinkUsed: patch.fallbackLinkUsed ?? existing?.fallbackLinkUsed ?? false,
    guardianId: patch.guardianId ?? existing?.guardianId,
    telegramUserId: patch.telegramUserId ?? existing?.telegramUserId,
  };
  data.entries = [entry, ...data.entries.filter((item) => item.key !== key)].slice(0, 500);
  await writeJson(OUTBOX_FILE, data);
  return entry;
}

// --------------------------------------------------------------------------
// Niat pembayaran & event gateway
// --------------------------------------------------------------------------

interface IntentFile {
  intents: GatewayPaymentIntent[];
}

export async function savePaymentIntent(intent: GatewayPaymentIntent): Promise<void> {
  const data = await readJson<IntentFile>(INTENTS_FILE, { intents: [] });
  data.intents = [intent, ...data.intents.filter((item) => item.paymentId !== intent.paymentId)].slice(0, 500);
  await writeJson(INTENTS_FILE, data);
}

export async function getPaymentIntent(paymentId: string): Promise<GatewayPaymentIntent | undefined> {
  const data = await readJson<IntentFile>(INTENTS_FILE, { intents: [] });
  return data.intents.find((intent) => intent.paymentId === paymentId);
}

interface EventFile {
  events: GatewayConfirmedEvent[];
}

export async function recordGatewayEvent(event: GatewayConfirmedEvent): Promise<boolean> {
  const data = await readJson<EventFile>(EVENTS_FILE, { events: [] });
  const exists = data.events.some(
    (item) => item.eventId === event.eventId || item.gatewayTransactionId === event.gatewayTransactionId
  );
  if (exists) return false;
  data.events = [event, ...data.events].slice(0, 1000);
  await writeJson(EVENTS_FILE, data);
  return true;
}

export async function getGatewayEvents(): Promise<GatewayConfirmedEvent[]> {
  const data = await readJson<EventFile>(EVENTS_FILE, { events: [] });
  return data.events;
}

// --------------------------------------------------------------------------
// Idempotensi webhook
// --------------------------------------------------------------------------

interface ProcessedFile {
  keys: string[];
}

export async function isProcessedKey(key: string): Promise<boolean> {
  const data = await readJson<ProcessedFile>(PROCESSED_FILE, { keys: [] });
  return data.keys.includes(key);
}

export async function markProcessedKey(key: string): Promise<void> {
  const data = await readJson<ProcessedFile>(PROCESSED_FILE, { keys: [] });
  if (data.keys.includes(key)) return;
  data.keys = [key, ...data.keys].slice(0, 5000);
  await writeJson(PROCESSED_FILE, data);
}

// --------------------------------------------------------------------------
// Penyimpanan PDF kuitansi
// --------------------------------------------------------------------------

interface ReceiptMetaFile {
  files: Array<{
    receiptId: string;
    paymentId: string;
    guardianId?: string;
    fileName: string;
    checksum: string;
    size: number;
    createdAt: string;
  }>;
}

export async function storeReceiptPdf(input: {
  receiptId: string;
  paymentId: string;
  guardianId?: string;
  pdfBase64: string;
  checksum?: string;
}): Promise<{ ok: boolean; error?: string; fileName?: string }> {
  const buffer = Buffer.from(input.pdfBase64, 'base64');
  if (buffer.length === 0) return { ok: false, error: 'PDF kosong.' };
  if (buffer.length > 5 * 1024 * 1024) return { ok: false, error: 'Ukuran PDF melebihi 5 MB.' };
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { ok: false, error: 'Berkas bukan PDF yang valid.' };
  }

  const safeId = input.receiptId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  const fileName = `${safeId}.pdf`;
  await ensureDir(RECEIPTS_DIR);
  await fs.writeFile(path.join(RECEIPTS_DIR, fileName), buffer);

  const meta = await readJson<ReceiptMetaFile>(RECEIPT_META_FILE, { files: [] });
  const record = {
    receiptId: input.receiptId,
    paymentId: input.paymentId,
    guardianId: input.guardianId,
    fileName,
    checksum:
      input.checksum ||
      createHmac('sha256', getReceiptSecret()).update(buffer).digest('hex').slice(0, 32),
    size: buffer.length,
    createdAt: new Date().toISOString(),
  };
  meta.files = [record, ...meta.files.filter((item) => item.receiptId !== input.receiptId)].slice(0, 1000);
  await writeJson(RECEIPT_META_FILE, meta);
  return { ok: true, fileName };
}

export async function readReceiptPdf(receiptId: string): Promise<Buffer | null> {
  const meta = await readJson<ReceiptMetaFile>(RECEIPT_META_FILE, { files: [] });
  const record = meta.files.find((item) => item.receiptId === receiptId);
  if (!record) return null;
  try {
    return await fs.readFile(path.join(RECEIPTS_DIR, record.fileName));
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Secret & token kuitansi
// --------------------------------------------------------------------------

let ephemeralSecret: string | null = null;

function getReceiptSecret(): string {
  const configured = (process.env.RECEIPT_LINK_SECRET || '').trim();
  if (configured.length >= 16) return configured;
  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32).toString('hex');
    console.warn(
      '[receipts] RECEIPT_LINK_SECRET belum diisi. Memakai secret sementara; tautan kuitansi tidak berlaku setelah server restart.'
    );
  }
  return ephemeralSecret;
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

export function createReceiptToken(receiptId: string, guardianId: string, ttlMs = 30 * 60 * 1000): string {
  const payload = base64url(JSON.stringify({ rid: receiptId, gid: guardianId, exp: Date.now() + ttlMs }));
  const signature = createHmac('sha256', getReceiptSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyReceiptToken(
  token: string,
  receiptId: string
): { ok: boolean; guardianId?: string; error?: string } {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return { ok: false, error: 'Token tidak valid.' };
  const expected = createHmac('sha256', getReceiptSecret()).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'Tanda tangan token tidak valid.' };
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      rid?: string;
      gid?: string;
      exp?: number;
    };
    if (data.rid !== receiptId) return { ok: false, error: 'Token bukan untuk kuitansi ini.' };
    if (!data.exp || data.exp < Date.now()) return { ok: false, error: 'Token sudah kedaluwarsa.' };
    return { ok: true, guardianId: data.gid };
  } catch {
    return { ok: false, error: 'Token tidak dapat dibaca.' };
  }
}

// --------------------------------------------------------------------------
// Validasi webhook payment gateway
// --------------------------------------------------------------------------

export function verifyGatewaySignature(rawBody: string, signature: string, timestamp: string): {
  ok: boolean;
  error?: string;
} {
  const secret = (process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET || '').trim();
  if (!secret) return { ok: false, error: 'Webhook gateway belum dikonfigurasi di server.' };
  if (!signature) return { ok: false, error: 'Signature webhook tidak ada.' };

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) return { ok: false, error: 'Timestamp webhook tidak valid.' };
  if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return { ok: false, error: 'Timestamp webhook di luar batas 5 menit (kemungkinan replay).' };
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const a = Buffer.from(signature.toLowerCase());
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'Signature webhook tidak cocok.' };
  }
  return { ok: true };
}

export function createGatewaySignature(rawBody: string, timestamp: string): string | null {
  const secret = (process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET || '').trim();
  if (!secret) return null;
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function isDemoSimulationAllowed(): boolean {
  if ((process.env.ALLOW_DEMO_PAYMENT_SIMULATION || '').toLowerCase() === 'true') return true;
  if ((process.env.ALLOW_DEMO_PAYMENT_SIMULATION || '').toLowerCase() === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

export function getRuntimeDataDir(): string {
  return DATA_DIR;
}
