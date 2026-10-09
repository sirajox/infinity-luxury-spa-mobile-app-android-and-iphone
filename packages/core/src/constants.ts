export const BRAND = {
  name: 'Infinity Luxury Spa & Aesthetics',
  legalName: 'Infinity Luxury Spa & Aesthetics Limited',
  tagline: 'Where Endless Beauty Begins',
  established: 2009,
} as const;

export const COLORS = {
  black: '#0D0D0D',
  gold: '#A68917',
  white: '#FFFFFF',
  goldText: '#88700F',
  goldSoft: '#F6F1E0',
  warm: '#FBF8EF',
  grey50: '#F7F7F7',
  grey200: '#E6E6E6',
  grey600: '#666666',
  success: '#2E7D4F',
  error: '#B3261E',
} as const;

/** Delivery states offered in checkout. Whether a state is actually deliverable is decided by `delivery_fees`. */
export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi',
  'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;
