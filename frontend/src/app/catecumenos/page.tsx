import CatecumenosTable from '@/components/CatecumenosTable';

export default function CatecumenosPage() {
  return (
    <div className="animate-fade-up">
      <div className="mb-7">
        <h1 className="font-display text-2xl font-bold text-navy-900">Catecúmenos</h1>
        <p className="text-slate-500 text-sm mt-1">Lista completa de catecúmenos activos</p>
      </div>
      <CatecumenosTable />
    </div>
  );
}
