import { useContext } from 'react';
import { AuthContext } from '@/features/auth/AuthContext';
import type { UserRole } from '@/types/auth';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth muss innerhalb des AuthProvider verwendet werden.');
  }
  return context;
}

export function useRoleCheck(requiredRole: UserRole) {
  const { role } = useAuth();
  if (requiredRole === 'admin') {
    return role === 'admin';
  }
  return role === 'user' || role === 'admin';
}
