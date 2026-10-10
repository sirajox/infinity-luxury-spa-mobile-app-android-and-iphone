import type { LucideIcon } from 'lucide-react';
import {
  Banknote, BarChart3, Bell, BookOpen, CalendarDays, CalendarRange, ClipboardList, Gift, LayoutDashboard, LifeBuoy,
  MapPin, Package, Percent, ReceiptText, RotateCcw, ScrollText, Settings, ShieldCheck, ShoppingBag, Sparkles, Star,
  Tags, Ticket, UserCog, Users, UsersRound, Warehouse, FolderTree, Image as ImageIcon, Crown,
} from 'lucide-react';

export interface NavItem { href: string; label: string; icon: LucideIcon; permission: string }
export interface NavGroup { title: string; items: NavItem[] }

/** Sidebar. Items are hidden when the signed-in staff member holds no grant for the permission. */
export const NAV: NavGroup[] = [
  { title: 'Overview', items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard, permission: '' }] },
  {
    title: 'Operations',
    items: [
      { href: '/bookings', label: 'Bookings', icon: CalendarDays, permission: 'bookings.view' },
      { href: '/calendar', label: 'Calendar', icon: CalendarRange, permission: 'bookings.view' },
      { href: '/customers', label: 'Customers', icon: Users, permission: 'customers.view' },
      { href: '/orders', label: 'Orders', icon: ShoppingBag, permission: 'orders.view' },
      { href: '/inventory', label: 'Inventory', icon: Warehouse, permission: 'inventory.view' },
      { href: '/support', label: 'Support tickets', icon: LifeBuoy, permission: 'support.manage' },
    ],
  },
  {
    title: 'Money',
    items: [
      { href: '/payments', label: 'Payments', icon: Banknote, permission: 'payments.view' },
      { href: '/refunds', label: 'Refunds', icon: RotateCcw, permission: 'payments.view' },
      { href: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports.view' },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { href: '/manage/service-categories', label: 'Treatment categories', icon: FolderTree, permission: 'categories.manage' },
      { href: '/manage/service-subcategories', label: 'Subcategories', icon: Tags, permission: 'categories.manage' },
      { href: '/manage/services', label: 'Treatments', icon: Sparkles, permission: 'treatments.manage' },
      { href: '/manage/products', label: 'Products', icon: Package, permission: 'products.view' },
      { href: '/manage/product-categories', label: 'Product categories', icon: FolderTree, permission: 'categories.manage' },
      { href: '/manage/packages', label: 'Packages', icon: Gift, permission: 'packages.manage' },
      { href: '/manage/membership-plans', label: 'Memberships', icon: Crown, permission: 'memberships.manage' },
      { href: '/manage/coupons', label: 'Coupons', icon: Percent, permission: 'coupons.manage' },
      { href: '/reviews', label: 'Reviews', icon: Star, permission: 'reviews.moderate' },
    ],
  },
  {
    title: 'Business',
    items: [
      { href: '/manage/branches', label: 'Branches', icon: MapPin, permission: 'branches.manage' },
      { href: '/manage/staff', label: 'Staff', icon: UsersRound, permission: 'staff.manage' },
      { href: '/manage/delivery-fees', label: 'Delivery fees', icon: ReceiptText, permission: 'settings.manage' },
    ],
  },
  {
    title: 'Content',
    items: [
      { href: '/manage/banners', label: 'Promotional banners', icon: ImageIcon, permission: 'banners.manage' },
      { href: '/notifications', label: 'Notifications', icon: Bell, permission: 'notifications.send' },
      { href: '/manage/content', label: 'Policies & content', icon: BookOpen, permission: 'content.manage' },
      { href: '/manage/faqs', label: 'FAQs', icon: ClipboardList, permission: 'content.manage' },
      { href: '/manage/tour', label: 'Onboarding & tour', icon: Ticket, permission: 'content.manage' },
      { href: '/manage/email-templates', label: 'Email templates', icon: ScrollText, permission: 'content.manage' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/users', label: 'Users', icon: UserCog, permission: 'users.manage' },
      { href: '/roles', label: 'Roles & permissions', icon: ShieldCheck, permission: 'roles.manage' },
      { href: '/settings', label: 'Settings', icon: Settings, permission: 'settings.manage' },
      { href: '/audit', label: 'Audit logs', icon: ScrollText, permission: 'audit.view' },
    ],
  },
];
