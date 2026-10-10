export type SettingFieldType = 'int' | 'percent_bps' | 'bool' | 'text' | 'textarea' | 'kobo' | 'providers' | 'branch_slug';

export interface SettingField {
  /** settings.key */
  key: string;
  /** For composite JSON settings: the property to edit. */
  path?: string;
  name: string;
  label: string;
  type: SettingFieldType;
  help?: string;
  min?: number;
}

export interface SettingGroup { id: string; title: string; description: string; fields: SettingField[] }

/** Settings the owner can change without a developer. Anything not listed stays as seeded. */
export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: 'booking', title: 'Booking rules', description: 'These apply to every branch and are enforced by the booking engine.',
    fields: [
      { key: 'booking.min_notice_hours', name: 'min_notice', label: 'Minimum notice before an appointment (hours)', type: 'int', min: 0 },
      { key: 'booking.max_window_days', name: 'max_window', label: 'How far ahead customers can book (days)', type: 'int', min: 1 },
      { key: 'booking.slot_step_minutes', name: 'slot_step', label: 'Time between offered start times (minutes)', type: 'int', min: 5 },
      { key: 'booking.hold_minutes', name: 'hold', label: 'How long a slot is held while paying (minutes)', type: 'int', min: 1 },
      { key: 'booking.advance_bps', name: 'advance', label: 'Advance payment (% of treatment price)', type: 'percent_bps', help: 'UNVERIFIED default of 33.33%. Confirm the policy before launch.' },
      { key: 'booking.cancel_free_hours', name: 'cancel_free', label: 'Free cancellation until (hours before)', type: 'int', min: 0 },
      { key: 'booking.reschedule_min_hours', name: 'reschedule', label: 'Customers can reschedule until (hours before)', type: 'int', min: 0 },
    ],
  },
  {
    id: 'payments', title: 'Payments', description: 'Which providers customers can choose at checkout. Provider keys are configured on the server, never here.',
    fields: [{ key: 'payments.providers', name: 'providers', label: 'Enabled payment providers', type: 'providers' }],
  },
  {
    id: 'store', title: 'Store', description: 'Checkout behaviour.',
    fields: [{ key: 'inventory.reservation_minutes', name: 'reservation', label: 'How long stock is held during checkout (minutes)', type: 'int', min: 5 }],
  },
  {
    id: 'consultation', title: 'Consultation', description: 'Shown on treatment lists. Leave empty to hide the consultation note.',
    fields: [{ key: 'consultation.fee_kobo', name: 'fee', label: 'Consultation fee', type: 'kobo' }],
  },
  {
    id: 'maintenance', title: 'Maintenance mode', description: 'When on, customers see the message below instead of the app. Staff can still sign in.',
    fields: [
      { key: 'maintenance', path: 'enabled', name: 'enabled', label: 'Maintenance mode on', type: 'bool' },
      { key: 'maintenance', path: 'message', name: 'message', label: 'Message to customers', type: 'textarea' },
    ],
  },
  {
    id: 'support', title: 'Support contact', description: 'Used by Help & Support in the app.',
    fields: [
      { key: 'support.contact', path: 'email', name: 'email', label: 'Support email', type: 'text', help: 'Leave empty to hide the "Email us" button.' },
      { key: 'support.contact', path: 'whatsapp_branch', name: 'wa_branch', label: 'Branch whose WhatsApp backs "WhatsApp us"', type: 'branch_slug' },
    ],
  },
  {
    id: 'business', title: 'Business profile & social links', description: 'Brand details and handles shown in the app.',
    fields: [
      { key: 'business.profile', path: 'name', name: 'biz_name', label: 'Business name', type: 'text' },
      { key: 'business.profile', path: 'tagline', name: 'tagline', label: 'Tagline', type: 'text' },
      { key: 'social.links', path: 'instagram', name: 'instagram', label: 'Instagram', type: 'text' },
      { key: 'social.links', path: 'facebook', name: 'facebook', label: 'Facebook', type: 'text' },
      { key: 'social.links', path: 'tiktok', name: 'tiktok', label: 'TikTok', type: 'text' },
      { key: 'social.links', path: 'youtube', name: 'youtube', label: 'YouTube', type: 'text' },
    ],
  },
];
