import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchEnabledProviders, runHostedCheckout, verifyPayment } from './api';

export const useEnabledProviders = () => useQuery({ queryKey: ['settings', 'providers'], queryFn: fetchEnabledProviders, staleTime: 5 * 60_000 });

/** After any checkout, every cached view that depends on money or fulfilment is refreshed from the server. */
function useRefreshAfterPayment() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['bookings'] });
    void qc.invalidateQueries({ queryKey: ['booking'] });
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['order'] });
    void qc.invalidateQueries({ queryKey: ['cart'] });
    void qc.invalidateQueries({ queryKey: ['memberships'] });
  };
}

export function useCheckout() {
  const refresh = useRefreshAfterPayment();
  return useMutation({ mutationFn: runHostedCheckout, onSettled: refresh });
}

export function useRecheckPayment() {
  const refresh = useRefreshAfterPayment();
  return useMutation({ mutationFn: verifyPayment, onSettled: refresh });
}
