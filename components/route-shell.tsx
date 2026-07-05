'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminFrame } from '@/components/shell';
import { PageEnterMotion } from '@/components/page-enter-motion';

/** Bare chrome for the login screen and the full-screen document editor; sidebar everywhere else. */
function usesBareChrome(pathname: string) {
  return pathname === '/login' || /^\/documents\/[^/]+\/edit/.test(pathname);
}

export function RouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <PageEnterMotion>
      {usesBareChrome(pathname) ? children : <AdminFrame>{children}</AdminFrame>}
    </PageEnterMotion>
  );
}
