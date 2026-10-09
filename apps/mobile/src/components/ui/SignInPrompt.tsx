import { usePathname, useRouter } from 'expo-router';
import { EmptyState } from './State';
import type { IconName } from './Icon';

/** Shown on tabs that need an account (bookings, orders, profile) when the visitor is browsing as a guest. */
export function SignInPrompt({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <EmptyState icon={icon} title={title} body={body} actionLabel="Sign in or create account" onAction={() => router.push({ pathname: '/(auth)/sign-in', params: { next: pathname } })} />
  );
}
