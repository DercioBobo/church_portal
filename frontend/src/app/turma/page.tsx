import { Suspense } from 'react';
import TurmaContent from './TurmaContent';
import Loading from '@/components/Loading';

export default function TurmaPage() {
  return (
    <Suspense fallback={<Loading />}>
      <TurmaContent />
    </Suspense>
  );
}
