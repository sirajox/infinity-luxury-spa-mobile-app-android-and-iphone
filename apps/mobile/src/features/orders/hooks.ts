import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/store';
import { cancelUnpaidOrder, createOrder } from '@/features/store/cart';
import { fetchOrder, fetchOrders } from './api';

export const useOrders = () => {
  const userId = useUserId();
  return useQuery({ queryKey: ['orders', userId], queryFn: fetchOrders, enabled: !!userId });
};

export const useOrder = (id: string | undefined) =>
  useQuery({ queryKey: ['order', id], queryFn: () => fetchOrder(id as string), enabled: !!id, refetchInterval: 30_000 });

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOrder,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['orders'] }),
    // Stock may have changed under us; refresh every cart view.
    onError: () => void qc.invalidateQueries({ queryKey: ['cart'] }),
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelUnpaidOrder,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['order'] });
    },
  });
}
