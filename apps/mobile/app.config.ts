import type { ConfigContext, ExpoConfig } from 'expo/config';

const appEnv = process.env.APP_ENV ?? 'development';
const suffix = appEnv === 'production' ? '' : `.${appEnv}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appEnv === 'production' ? 'Infinity Luxury Spa' : `Infinity Spa (${appEnv})`,
  slug: 'infinity-luxury-spa',
  scheme: 'infinityspa',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: '#FFFFFF',
  ios: {
    // PLACEHOLDER identifiers: replace with the identifiers registered in your Apple/Google developer accounts.
    bundleIdentifier: `com.infinityluxuryspa.app${suffix}`,
    supportsTablet: false,
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCalendarsUsageDescription: 'Infinity Luxury Spa adds your confirmed appointments to your calendar.',
      NSCalendarsFullAccessUsageDescription: 'Infinity Luxury Spa adds your confirmed appointments to your calendar.',
    },
  },
  android: {
    package: `com.infinityluxuryspa.app${suffix}`,
    adaptiveIcon: { foregroundImage: './assets/images/adaptive-icon.png', backgroundColor: '#0D0D0D' },
    permissions: ['WRITE_CALENDAR', 'READ_CALENDAR'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-apple-authentication',
    ['expo-splash-screen', { image: './assets/images/splash-icon.png', imageWidth: 180, backgroundColor: '#0D0D0D' }],
    ['expo-notifications', { icon: './assets/images/notification-icon.png', color: '#A68917' }],
    ['expo-calendar', { calendarPermission: 'Infinity Luxury Spa adds your confirmed appointments to your calendar.' }],
    // Source-map upload needs a Sentry org/project/token; enable the plugin only when they are configured.
    ...(process.env.SENTRY_AUTH_TOKEN ? ['@sentry/react-native' as const] : []),
  ],
  experiments: { typedRoutes: true },
  runtimeVersion: { policy: 'appVersion' },
  updates: { fallbackToCacheTimeout: 0 },
  extra: { appEnv, eas: { projectId: 'a8819c88-dfc0-48cd-acd8-ab4bf7fff8bf' } },
});
