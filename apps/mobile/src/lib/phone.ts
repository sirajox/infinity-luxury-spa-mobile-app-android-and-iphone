/** Nigerian numbers are stored locally (0806…) but wa.me and tel: need the international form without "+". */
export function toInternational(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
}
