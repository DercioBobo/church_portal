import { Suspense } from 'react';
import SacramentoContent from './SacramentoContent';
import Loading from '@/components/Loading';

export default function SacramentoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SacramentoContent />
    </Suspense>
  );
}
