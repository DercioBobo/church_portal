import type { Metadata, Viewport } from 'next';
import './globals.css';

const parishShort = process.env.NEXT_PUBLIC_PARISH_SHORT || 'PNSA';
const parishName  = process.env.NEXT_PUBLIC_PARISH_NAME  || 'PNSA';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',   // enables env(safe-area-inset-bottom) on iOS
};

export const metadata: Metadata = {
  title: `${parishShort} — Portal do Catequista`,
  description: `Área restrita para catequistas de ${parishName}`,
  icons: {
    icon: '/files/20.png',
    shortcut: '/files/20.png',
    apple: '/files/20.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="font-sans bg-cream-50 min-h-screen text-slate-900">
        {children}
      </body>
    </html>
  );
}
