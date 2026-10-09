export const PERMISSIONS = [
  'bookings.view', 'bookings.create', 'bookings.update', 'bookings.cancel',
  'customers.view', 'customers.manage',
  'payments.view', 'refunds.create',
  'products.view', 'products.create', 'products.update', 'products.delete',
  'treatments.manage', 'categories.manage',
  'inventory.view', 'inventory.adjust',
  'orders.view', 'orders.update',
  'staff.manage', 'branches.manage',
  'packages.manage', 'memberships.manage', 'coupons.manage',
  'reviews.moderate', 'banners.manage', 'content.manage',
  'notifications.send', 'support.manage',
  'users.manage', 'roles.manage', 'settings.manage',
  'reports.view', 'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = [
  'super_admin', 'business_owner', 'branch_manager', 'booking_manager', 'store_manager',
  'inventory_manager', 'finance_manager', 'customer_support', 'content_manager',
] as const;
export type RoleKey = (typeof ROLES)[number];

const all = [...PERMISSIONS] as Permission[];

/**
 * Default role → permission matrix. The SQL seed in supabase/migrations is the source of truth
 * at runtime; this table documents the intent and is checked against the seed by the DB tests.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  super_admin: all,
  business_owner: all.filter((p) => p !== 'roles.manage'),
  branch_manager: [
    'bookings.view', 'bookings.create', 'bookings.update', 'bookings.cancel', 'customers.view',
    'orders.view', 'orders.update', 'inventory.view', 'inventory.adjust', 'staff.manage',
    'reports.view', 'reviews.moderate', 'support.manage',
  ],
  booking_manager: ['bookings.view', 'bookings.create', 'bookings.update', 'bookings.cancel', 'customers.view'],
  store_manager: [
    'products.view', 'products.create', 'products.update', 'orders.view', 'orders.update',
    'inventory.view', 'coupons.manage', 'reviews.moderate',
  ],
  inventory_manager: ['products.view', 'inventory.view', 'inventory.adjust'],
  finance_manager: ['payments.view', 'refunds.create', 'reports.view', 'orders.view', 'bookings.view', 'audit.view'],
  customer_support: ['bookings.view', 'bookings.update', 'customers.view', 'orders.view', 'support.manage', 'notifications.send'],
  content_manager: ['content.manage', 'banners.manage', 'notifications.send', 'treatments.manage', 'categories.manage', 'products.view'],
};

export function hasPermission(granted: ReadonlySet<Permission> | readonly Permission[], needed: Permission): boolean {
  return Array.isArray(granted)
    ? (granted as readonly Permission[]).includes(needed)
    : (granted as ReadonlySet<Permission>).has(needed);
}
