import { useAuth } from '@/features/auth/useAuth';

export function useCurrentUser() {
  const { user, isAuthenticated, status } = useAuth();

  return {
    user,
    isAuthenticated,
    isLoading: status === 'loading',
  };
}
