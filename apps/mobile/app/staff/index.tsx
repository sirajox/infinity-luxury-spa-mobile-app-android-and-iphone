import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { StaffOption } from '@/features/catalog/components';
import { useAllStaff } from '@/features/catalog/hooks';
import { toUserMessage } from '@/lib/errors';

export default function AllStaff() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useAllStaff();
  return (
    <Screen header={<ScreenHeader title="Our team" subtitle="Meet the specialists across our branches" />}>
      {isLoading ? <SkeletonList rows={4} height={92} /> : isError ? <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /> : (data?.length ?? 0) === 0 ? (
        <EmptyState icon="user" title="Our team is being introduced" body="Specialist profiles will appear here soon." />
      ) : (
        <View style={styles.list}>
          {data?.map((s) => (
            <StaffOption key={s.id} staff={s} selected={false} onSelect={() => router.push({ pathname: '/staff/[id]', params: { id: s.id } })} onProfile={() => router.push({ pathname: '/staff/[id]', params: { id: s.id } })} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: 12 } });
