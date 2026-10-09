import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PERSIST } from '@/lib/queryClient';
import {
  fetchBranches, fetchCategories, fetchCategoryWithSubcategories, fetchEligibleStaff, fetchFeaturedServices, fetchReviews,
  fetchService, fetchStaff, fetchStaffTreatments, fetchSubcategoryWithServices, fetchTopStaff, searchServices,
} from './api';

const HOUR = 60 * 60 * 1000;

export const catalogKeys = {
  branches: ['catalog', 'branches'] as const,
  categories: ['catalog', 'categories'] as const,
  category: (slug: string) => ['catalog', 'category', slug] as const,
  subcategory: (slug: string) => ['catalog', 'subcategory', slug] as const,
  featured: ['catalog', 'featured'] as const,
  service: (slug: string) => ['catalog', 'service', slug] as const,
  topStaff: ['catalog', 'top-staff'] as const,
  staff: (id: string) => ['catalog', 'staff', id] as const,
  eligibleStaff: (serviceId: string, branchId: string) => ['catalog', 'eligible-staff', serviceId, branchId] as const,
  staffTreatments: (id: string) => ['catalog', 'staff-treatments', id] as const,
  reviews: (kind: string, id: string) => ['catalog', 'reviews', kind, id] as const,
  search: (q: string) => ['catalog', 'search', q] as const,
};

// Catalogue reads are public and safe to show from cache while offline (meta.persist).
export const useBranches = () => useQuery({ queryKey: catalogKeys.branches, queryFn: fetchBranches, staleTime: HOUR, meta: PERSIST });
export const useCategories = () => useQuery({ queryKey: catalogKeys.categories, queryFn: fetchCategories, staleTime: 10 * 60_000, meta: PERSIST });
export const useCategory = (slug: string) => useQuery({ queryKey: catalogKeys.category(slug), queryFn: () => fetchCategoryWithSubcategories(slug), meta: PERSIST });
export const useSubcategory = (slug: string) => useQuery({ queryKey: catalogKeys.subcategory(slug), queryFn: () => fetchSubcategoryWithServices(slug), meta: PERSIST });
export const useFeaturedServices = () => useQuery({ queryKey: catalogKeys.featured, queryFn: () => fetchFeaturedServices(), meta: PERSIST });
export const useService = (slug: string | undefined) => useQuery({ queryKey: catalogKeys.service(slug ?? ''), queryFn: () => fetchService(slug as string), enabled: !!slug, meta: PERSIST });
export const useTopStaff = () => useQuery({ queryKey: catalogKeys.topStaff, queryFn: () => fetchTopStaff(), meta: PERSIST });
export const useAllStaff = () => useQuery({ queryKey: ['catalog', 'all-staff'], queryFn: () => fetchTopStaff(60), meta: PERSIST });
export const useStaff = (id: string) => useQuery({ queryKey: catalogKeys.staff(id), queryFn: () => fetchStaff(id), meta: PERSIST });
export const useStaffTreatments = (id: string) => useQuery({ queryKey: catalogKeys.staffTreatments(id), queryFn: () => fetchStaffTreatments(id) });

// Eligibility drives a live booking decision: never persisted.
export const useEligibleStaff = (serviceId: string | undefined, branchId: string | undefined) =>
  useQuery({
    queryKey: catalogKeys.eligibleStaff(serviceId ?? '', branchId ?? ''),
    queryFn: () => fetchEligibleStaff(serviceId as string, branchId as string),
    enabled: !!serviceId && !!branchId,
    staleTime: 30_000,
  });

export const useStaffReviews = (id: string) => useQuery({ queryKey: catalogKeys.reviews('staff', id), queryFn: () => fetchReviews({ staffId: id }) });
export const useServiceReviews = (id: string | undefined) => useQuery({ queryKey: catalogKeys.reviews('service', id ?? ''), queryFn: () => fetchReviews({ serviceId: id }), enabled: !!id });

export const useServiceSearch = (q: string) =>
  useQuery({ queryKey: catalogKeys.search(q), queryFn: () => searchServices(q), enabled: q.trim().length >= 2, placeholderData: keepPreviousData, staleTime: 30_000 });
