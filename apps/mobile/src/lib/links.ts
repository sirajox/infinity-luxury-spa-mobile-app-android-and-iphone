import { Linking, Share } from 'react-native';
import { toast } from '@/stores/toast';
import { toInternational } from './phone';

async function open(url: string, failure: string) {
  try {
    await Linking.openURL(url);
  } catch {
    toast.error(failure);
  }
}

export const callPhone = (phone: string) => open(`tel:+${toInternational(phone)}`, 'Calling is not available on this device.');

export const openWhatsApp = (phone: string, message?: string) =>
  open(`https://wa.me/${toInternational(phone)}${message ? `?text=${encodeURIComponent(message)}` : ''}`, 'Could not open WhatsApp.');

export interface MapTarget { name: string; address_line: string; area: string | null; city: string; latitude: number | null; longitude: number | null }

export const openDirections = (b: MapTarget) => {
  const query = b.latitude != null && b.longitude != null
    ? `${b.latitude},${b.longitude}`
    : [`Infinity Luxury Spa ${b.name}`, b.address_line, b.area, b.city].filter(Boolean).join(', ');
  return open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, 'Could not open maps.');
};

export const openEmail = (to: string, subject?: string) =>
  open(`mailto:${to}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`, 'No email app is available.');

export async function shareText(message: string) {
  try {
    await Share.share({ message });
  } catch {
    toast.error('Sharing is not available right now.');
  }
}
