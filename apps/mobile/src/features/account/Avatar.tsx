import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { Icon } from '@/components/ui/Icon';
import { Photo } from '@/components/ui/Photo';
import { signedAvatarUrl } from './api';

/** Avatars are private objects; a short-lived signed URL is requested and cached for the session. */
export function Avatar({ path, size = 72 }: { path: string | null | undefined; size?: number }) {
  const { data } = useQuery({ queryKey: ['profile', 'avatar', path], queryFn: () => signedAvatarUrl(path as string), enabled: !!path, staleTime: 50 * 60_000 });
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      {data ? <Photo uri={data} style={{ width: size, height: size }} alt="Your profile photo" /> : <Icon name="user" size={size * 0.4} color={colors.goldText} />}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { backgroundColor: '#EFE7CF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
