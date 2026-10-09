import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logo = require('../../../assets/images/logo.png') as number;

/** Shown instead of the app when required public configuration is absent. Lists variable names only, never values. */
export function ConfigError({ problems }: { problems: string[] }) {
  return (
    <SafeAreaView style={styles.dark}>
      <View style={styles.center}>
        <Image source={logo} style={styles.logoSmall} contentFit="contain" />
        <Text variant="h2" color={colors.white} align="center">Setup required</Text>
        <Text variant="body" color={colors.onDarkMuted} align="center">
          The app is missing configuration: {problems.join(', ')}. Copy apps/mobile/.env.example to .env, fill in your Supabase
          project values and restart the dev server.
        </Text>
      </View>
    </SafeAreaView>
  );
}

/** Professional maintenance message. Staff accounts bypass it (see Shell). */
export function MaintenanceScreen({ message }: { message: string }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.dark}>
      <View style={styles.center}>
        <Image source={logo} style={styles.logo} contentFit="contain" />
        <Text variant="h1" color={colors.white} align="center">We will be right back</Text>
        <Text variant="body" color={colors.onDarkMuted} align="center">{message}</Text>
        <Button label="Staff sign in" variant="ghost" compact onPress={() => router.push('/(auth)/sign-in')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: colors.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  logo: { width: 112, height: 112, marginBottom: 12 },
  logoSmall: { width: 72, height: 72, marginBottom: 8 },
});
