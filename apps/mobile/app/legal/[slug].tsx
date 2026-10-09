import { useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '@/components/ui/Header';
import { Markdown } from '@/components/ui/Markdown';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { useContent } from '@/features/account/hooks';
import { toUserMessage } from '@/lib/errors';

/** Policies are authored in the admin dashboard; unpublished documents show a neutral notice, never placeholder legalese. */
export default function Legal() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, isLoading, isError, error, refetch } = useContent(slug);
  return (
    <Screen header={<ScreenHeader title={data?.title ?? 'Policy'} />}>
      {isLoading ? <SkeletonList rows={4} height={60} /> : isError ? <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /> : !data?.is_published || !data.body_markdown.trim() ? (
        <EmptyState icon="file" title="Coming soon" body="This document is being finalised. Please contact your branch if you need it sooner." />
      ) : <Markdown source={data.body_markdown} />}
    </Screen>
  );
}
