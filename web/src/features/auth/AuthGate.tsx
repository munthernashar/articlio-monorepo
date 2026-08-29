import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/AuthContext';

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  return <AuthProvider>{children}</AuthProvider>;
}
