import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { EmptyState } from '@/components/ui/State';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <EmptyState icon="search" title="This page is not available" body="The link may be out of date." actionLabel="Go to home" onAction={() => router.replace('/(tabs)')} />
    </Screen>
  );
}
