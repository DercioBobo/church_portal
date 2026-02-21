import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';
import GlobalSearch from '@/components/GlobalSearch';

const parishName = process.env.NEXT_PUBLIC_PARISH_NAME || 'PNSA';
const parishShort = process.env.NEXT_PUBLIC_PARISH_SHORT || 'PNSA';

export const metadata: Metadata = {
  title: `${parishShort} — Portal de Catequese`,
  description: `Portal público da catequese de ${parishName}`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="font-sans bg-cream-50 min-h-screen text-slate-900">
        <Nav />
        <GlobalSearch />
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-cream-300 mt-16 py-8 text-center">
          <p className="text-sm text-slate-400">
            © {new Date().getFullYear()}{' '}
            <span className="font-display italic text-navy-900/60">{parishName}</span>
            {' '}— Portal de Catequese
          </p>
        </footer>
      </body>
    </html>
  );
}
