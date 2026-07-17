'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function DocsRootRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);

  return (
    <>
      <meta httpEquiv="refresh" content={`0; url=${to}`} />
      <p>
        Redirecting to <a href={to}>Installation</a>&hellip;
      </p>
    </>
  );
}
