import { useQuery } from '@tanstack/react-query';
import { userEntitlementsService } from '@/services/supabase/user-entitlements.service';

export function useEntitlement(userId: string | undefined) {
  return useQuery({
    queryKey: ['entitlement', userId],
    queryFn: () => userEntitlementsService.getEffectiveForUser(userId!),
    enabled: Boolean(userId),
  });
}
