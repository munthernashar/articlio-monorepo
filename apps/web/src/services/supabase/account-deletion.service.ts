import { supabaseClient } from '@/services/supabase/client';

// Launch-Readiness-Audit, Welle 1 Punkt 4 (DSGVO Art. 17, Recht auf
// Löschung). Muss serverseitig laufen: `auth.admin.deleteUser` erfordert den
// Service-Role-Key, und das Stripe-Abo muss vor dem Löschen gekündigt
// werden. Siehe supabase/functions/delete-account/index.ts.
const REQUIRED_CONFIRMATION = 'DELETE_MY_ACCOUNT';

export const accountDeletionService = {
  async deleteOwnAccount(): Promise<void> {
    const { error } = await supabaseClient.functions.invoke('delete-account', {
      body: { confirm: REQUIRED_CONFIRMATION },
    });

    if (error) {
      throw new Error(error.message || 'Konto konnte nicht gelöscht werden.');
    }
  },
};
