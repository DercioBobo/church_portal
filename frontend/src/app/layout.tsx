import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

const parishName = process.env.NEXT_PUBLIC_PARISH_NAME || 'PNSA';
const parishShort = process.env.NEXT_PUBLIC_PARISH_SHORT || 'PNSA';

export const metadata: Metadata = {
  title: `${parishShort} — Portal de Catequese`,
  description: `Portal público da catequese de ${parishName}`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="font-sans bg-slate-50 min-h-screen text-slate-900">
        <Nav />
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-slate-200 mt-16 py-8 text-center text-sm text-slate-400">
          © {new Date().getFullYear()} {parishName} — Portal de Catequese
        </footer>
      </body>
    </html>
  );
}
