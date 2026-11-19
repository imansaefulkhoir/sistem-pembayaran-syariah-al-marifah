import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/layout/AppShell';
import ChatbotWidget from '@/components/chatbot/ChatbotWidget';
import ErrorNotifier from '@/components/system/ErrorNotifier';

export const metadata: Metadata = {
  title: "Sistem Pembayaran Syariah - PP Kebon Kelapa Al-Ma'rifah",
  description:
    "Sistem administrasi pembayaran pondok pesantren syariah untuk uang makan, SPP sekolah, dan syariah pondok. Pondok Pesantren Kebon Kelapa Al-Ma'rifah, Cirebon.",
  icons: {
    icon: '/images/logo.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link rel="icon" href="/images/logo.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased font-sans bg-slate-50 text-slate-900">
        <AppShell>{children}</AppShell>
        <ChatbotWidget />
        <ErrorNotifier />
      </body>
    </html>
  );
}
