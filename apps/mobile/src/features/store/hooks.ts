import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERSIST } from '@/lib/queryClient';
import { useUserId } from '@/features/auth/store';
import { useGuestCart } from '@/stores/guestCart';
import {
  fetchProduct, fetchProductCategories, fetchProductRating, fetchProducts, fetchRelatedProducts, fetchStockStatus, fetchWishlist,
  toggleWishlist, type ProductFlag,
} from './api';
import { cartAdd, fetchGuestCart, fetchServerCart, quoteCart, type CartLine } from './cart';

export const useProductCategories = () => useQuery({ queryKey: ['store', 'categories'], queryFn: fetchProductCategories, staleTime: 10 * 60_000, meta: PERSIST });

export function useProducts(filter: { categoryId?: string | null; q?: string; flag?: ProductFlag }) {
  return useInfiniteQuery({
    queryKey: ['store', 'products', filter],
    queryFn: ({ pageParam }) => fetchProducts({ ...filter, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    meta: filter.q ? undefined : PERSIST,
  });
}

export const useProduct = (slug: string) => useQuery({ queryKey: ['store', 'product', slug], queryFn: () => fetchProduct(slug), meta: PERSIST });
export const useRelatedProducts = (product: { id: string; category_id: string | null } | null | undefined) =>
  useQuery({ queryKey: ['store', 'related', product?.id], queryFn: () => fetchRelatedProducts(product as NonNullable<typeof product>), enabled: !!product });
export const useProductRating = (productId: string | undefined) =>
  useQuery({ queryKey: ['store', 'rating', productId], queryFn: () => fetchProductRating(productId as string), enabled: !!productId });

// Stock is shown for guidance only and refreshed often; checkout re-validates on the server.
export const useStockStatus = (variantIds: string[], branchId: string | null | undefined) =>
  useQuery({
    queryKey: ['store', 'stock', branchId, [...variantIds].sort().join(',')],
    queryFn: () => fetchStockStatus(variantIds, branchId as string),
    enabled: !!branchId && variantIds.length > 0,
    staleTime: 15_000,
  });

/** One cart abstraction: server cart when signed in, local guest cart otherwise. */
export function useCart() {
  const userId = useUserId();
  const guestLines = useGuestCart((s) => s.lines);
  const query = useQuery({
    queryKey: ['cart', userId ?? 'guest', userId ? null : guestLines],
    queryFn: () => (userId ? fetchServerCart() : fetchGuestCart(guestLines)),
    staleTime: 10_000,
  });
  const lines: CartLine[] = query.data ?? [];
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotalKobo = lines.reduce((n, l) => n + l.priceKobo * l.quantity, 0);
  return { ...query, lines, count, subtotalKobo };
}

/** Badge count without hydrating product data: guests read the local store, members read cart rows. */
export function useCartCount(): number {
  const userId = useUserId();
  const guest = useGuestCart((s) => s.lines.reduce((n, l) => n + l.quantity, 0));
  const { data } = useQuery({
    queryKey: ['cart', 'count', userId],
    queryFn: async () => (await fetchServerCart()).reduce((n, l) => n + l.quantity, 0),
    enabled: !!userId,
    staleTime: 15_000,
  });
  return userId ? data ?? 0 : guest;
}

export function useAddToCart() {
  const qc = useQueryClient();
  const userId = useUserId();
  const guestAdd = useGuestCart((s) => s.add);
  return useMutation({
    mutationFn: async ({ variantId, delta }: { variantId: string; delta: number }) => {
      if (userId) await cartAdd(variantId, delta);
      else guestAdd(variantId, delta);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cart'] }),
  });
}

export function useQuote(p: { branchId: string | null; fulfilment: 'delivery' | 'pickup'; state?: string | null; coupon?: string | null; enabled?: boolean }) {
  return useQuery({
    queryKey: ['cart', 'quote', p.branchId, p.fulfilment, p.state, p.coupon],
    queryFn: () => quoteCart({ branchId: p.branchId as string, fulfilment: p.fulfilment, state: p.state, coupon: p.coupon }),
    enabled: !!p.branchId && (p.enabled ?? true),
    staleTime: 0,
    gcTime: 30_000,
  });
}

export function useWishlist() {
  const userId = useUserId();
  return useQuery({ queryKey: ['wishlist', userId], queryFn: fetchWishlist, enabled: !!userId });
}

export function useToggleWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleWishlist,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['wishlist'] }),
  });
}
