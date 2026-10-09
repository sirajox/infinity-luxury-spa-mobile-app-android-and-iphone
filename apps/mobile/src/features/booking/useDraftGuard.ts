import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useBookingDraft } from '@/stores/bookingDraft';

/** Booking steps need the choices made before them; deep links into the middle of the flow restart it. */
export function useDraftGuard(need: 'service' | 'branch' | 'slot') {
  const router = useRouter();
  const draft = useBookingDraft();
  const missing =
    !draft.service || (need !== 'service' && !draft.branch) || (need === 'slot' && (!draft.date || !draft.time));
  useEffect(() => {
    if (missing) router.replace(draft.service ? '/booking/city' : '/treatments');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redirect once per render where the guard fails
  }, [missing]);
  return { draft, ready: !missing };
}
