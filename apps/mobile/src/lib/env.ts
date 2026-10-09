import { z } from 'zod';

const schema = z.object({
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string().min(20),
  googleWebClientId: z.string().optional(),
  sentryDsn: z.string().optional(),
  siteUrl: z.string().url().optional(),
});

// Expo only inlines *direct* `process.env.EXPO_PUBLIC_*` reads, so each variable is referenced explicitly.
const parsed = schema.safeParse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || undefined,
  siteUrl: process.env.EXPO_PUBLIC_SITE_URL || undefined,
});

export const envStatus = parsed.success
  ? ({ ok: true, env: parsed.data } as const)
  : // Report which variables are wrong, never their values.
    ({ ok: false, problems: parsed.error.issues.map((i) => i.path.join('.')) } as const);

/** Placeholders keep module-level clients constructible; the root layout blocks rendering when config is invalid. */
export const env = envStatus.ok
  ? envStatus.env
  : { supabaseUrl: 'http://localhost:54321', supabaseAnonKey: 'missing-anon-key-placeholder', googleWebClientId: undefined, sentryDsn: undefined, siteUrl: undefined };
