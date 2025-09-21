import { Suspense } from 'react';
import JoinClient from './JoinClient';

export const dynamic = 'force-dynamic';

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh flex items-center justify-center">Loading join page...</div>}>
      <JoinClient />
    </Suspense>
  );
}