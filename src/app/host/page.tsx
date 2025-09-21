import { Suspense } from 'react';
import JoinClient from './JoinClient';

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-dvh flex items-center justify-center">Loading…</div>}>
      <JoinClient />
    </Suspense>
  );
}