import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { env } from './env';

let enabled = false;

/** Strip anything that could carry credentials or personal data before an event leaves the device. */
function scrub(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      for (const h of Object.keys(event.request.headers)) {
        if (/authorization|apikey|cookie/i.test(h)) delete event.request.headers[h];
      }
    }
  }
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }
  return event;
}

export function initSentry() {
  if (!env.sentryDsn || __DEV__) return;
  Sentry.init({
    dsn: env.sentryDsn,
    release: `${Constants.expoConfig?.slug}@${Constants.expoConfig?.version}`,
    environment: (Constants.expoConfig?.extra as { appEnv?: string } | undefined)?.appEnv ?? 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend: scrub,
  });
  enabled = true;
}

export function reportError(error: unknown, context?: Record<string, string>) {
  if (enabled) Sentry.captureException(error, { extra: context });
  else if (__DEV__) console.warn('[error]', error, context);
}

export function setSentryUser(id: string | null) {
  if (enabled) Sentry.setUser(id ? { id } : null);
}

export const wrapRoot = Sentry.wrap;
