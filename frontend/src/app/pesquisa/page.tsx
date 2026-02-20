import { Suspense } from 'react';
import PesquisaContent from './PesquisaContent';
import Loading from '@/components/Loading';

export default function PesquisaPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PesquisaContent />
    </Suspense>
  );
}
