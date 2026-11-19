'use client';

import { useEffect } from 'react';
import { notifyTelegramEvent } from '@/lib/telegram/client';

/**
 * Pelapor error sisi browser (tanpa UI, tidak mengubah tampilan).
 *
 * Menangkap `window.onerror` dan `unhandledrejection`, lalu mengirim ringkasan
 * ke backend untuk diteruskan ke Telegram admin. Dibatasi maksimal 5 laporan
 * per sesi halaman agar tidak membanjiri grup.
 */

const MAX_REPORTS_PER_PAGE = 5;
const IGNORED_PATTERNS = [
  /ResizeObserver loop/i,
  /Script error\.?$/i,
  /Loading chunk .* failed/i,
  /AbortError/i,
  /Non-Error promise rejection captured/i,
];

export default function ErrorNotifier() {
  useEffect(() => {
    let reportCount = 0;

    const report = (source: string, detail: unknown) => {
      if (reportCount >= MAX_REPORTS_PER_PAGE) return;
      const message = detail instanceof Error ? detail.message : String(detail || '');
      if (!message) return;
      if (IGNORED_PATTERNS.some((pattern) => pattern.test(message))) return;

      reportCount += 1;
      notifyTelegramEvent('system_error', {
        reference: source,
        details: `${source}: ${message}`.slice(0, 380),
        url: window.location.pathname,
      });
    };

    const onError = (event: ErrorEvent) => {
      // Abaikan error resource (gambar/script) yang tidak punya pesan.
      if (!event.message) return;
      report('client-error', event.message);
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      report('unhandled-rejection', event.reason);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
