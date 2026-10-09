import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { useBooking } from '@/features/booking/hooks';
import { PaymentScreen } from '@/features/payments/PaymentScreen';
import { toUserMessage } from '@/lib/errors';
import { formatAppointment } from '@/lib/format';
import { useCountdown } from '@/lib/useCountdown';
import { track } from '@/lib/analytics';
import { useBookingDraft } from '@/stores/bookingDraft';

/** Screen 16: pay the advance/full amount (hold in force) or an outstanding balance (no hold). */
export default function BookingPayment() {
  const router = useRouter();
  const { bookingId, purpose } = useLocalSearchParams<{ bookingId: string; purpose?: 'booking' | 'booking_balance' }>();
  const { data: booking, isLoading, isError, error, refetch } = useBooking(bookingId);
  const isBalance = purpose === 'booking_balance';
  const seconds = useCountdown(isBalance ? null : booking?.hold_expires_at);
  const reset = useBookingDraft((s) => s.reset);

  if (isLoading) return <Screen><SkeletonList rows={3} height={120} /></Screen>;
  if (isError) return <Screen><ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /></Screen>;
  if (!booking) return <Screen><EmptyState icon="calendar" title="Booking not found" actionLabel="My bookings" onAction={() => router.replace('/(tabs)/bookings')} /></Screen>;

  const tz = booking.branches?.timezone ?? 'Africa/Lagos';
  const amount = isBalance ? booking.total_kobo - booking.paid_kobo : booking.due_now_kobo;
  const when = formatAppointment(booking.starts_at, tz).short;

  return (
    <PaymentScreen
      title="Payment"
      purpose={isBalance ? 'booking_balance' : 'booking'}
      targetId={booking.id}
      amountKobo={amount}
      summaryTop={isBalance ? 'Balance to pay now' : booking.payment_option === 'advance' ? 'Advance to pay now' : 'Amount to pay now'}
      summaryLabel={`${booking.service_name}, ${when}`}
      heldUntilSeconds={isBalance || booking.status !== 'pending' ? null : seconds}
      onPaid={() => {
        track({ name: 'payment_completed', purpose: isBalance ? 'booking_balance' : 'booking' });
        if (!isBalance) track({ name: 'booking_completed', serviceSlug: booking.services?.slug ?? 'unknown' });
        reset();
        router.replace({ pathname: '/booking/confirmed/[id]', params: { id: booking.id } });
      }}
      onExpired={() => router.replace(booking.services?.slug ? { pathname: '/treatment/[slug]', params: { slug: booking.services.slug } } : '/treatments')}
    />
  );
}
