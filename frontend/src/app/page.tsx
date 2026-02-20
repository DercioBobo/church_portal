'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Users, BookOpen, UserCheck, ChevronRight, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api';
import type { Estatisticas, Aniversariante } from '@/types/catequese';
import StatsCard from '@/components/StatsCard';
import BirthdayList from '@/components/BirthdayList';
import Loading from '@/components/Loading';

const PhaseChart = dynamic(() => import('@/components/PhaseChart'), { ssr: false });

export default function HomePage() {
  const [stats, setStats] = useState<Estatisticas | null>(null);
  const [birthdays, setBirthdays] = useState<Aniversariante[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    Promise.all([api.getEstatisticas(), api.getAniversariantes('hoje')])
      .then(([s, b]) => {
        setStats(s);
        setBirthdays(b ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/pesquisa?q=${encodeURIComponent(query.trim())}`);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Portal de Catequese</h1>
        <p className="text-slate-500">Consulte turmas, catecúmenos e horários</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatsCard label="Catecúmenos activos" value={stats.total_catecumenos} icon={<Users className="w-5 h-5" />} />
          <StatsCard label="Turmas activas" value={stats.total_turmas} icon={<BookOpen className="w-5 h-5" />} />
          <StatsCard label="Catequistas" value={stats.total_catequistas} icon={<UserCheck className="w-5 h-5" />} />
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="max-w-xl mx-auto relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          placeholder="Pesquisar catecúmeno ou catequista..."
          className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
        />
      </form>

      {/* Chart */}
      {stats && stats.por_fase.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Catecúmenos por Fase</h2>
          <PhaseChart data={stats.por_fase} />
        </div>
      )}

      {/* Birthdays */}
      <BirthdayList birthdays={birthdays} />

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/turmas"
          prefetch={false}
          className="flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <div>
            <div className="font-semibold text-slate-900">Ver Turmas</div>
            <div className="text-sm text-slate-500 mt-0.5">Todas as turmas activas</div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </Link>
        <Link
          href="/aniversarios"
          prefetch={false}
          className="flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <div>
            <div className="font-semibold text-slate-900">Aniversários</div>
            <div className="text-sm text-slate-500 mt-0.5">Hoje e esta semana</div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </Link>
      </div>
    </div>
  );
}
