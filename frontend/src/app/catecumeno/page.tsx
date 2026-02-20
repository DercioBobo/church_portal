import { Suspense } from 'react';
import CatecumenoContent from './CatecumenoContent';
import Loading from '@/components/Loading';

export default function CatecumenoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CatecumenoContent />
    </Suspense>
  );
}
