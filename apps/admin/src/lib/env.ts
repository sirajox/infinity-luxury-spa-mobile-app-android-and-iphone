import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
});

// NEXT_PUBLIC_* values are inlined at build time, so each is referenced explicitly.
const parsed = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

export const configProblems: string[] = parsed.success ? [] : parsed.error.issues.map((i) => String(i.path[0]));

/** Placeholder values keep builds working without a project; pages show a setup notice when `configProblems` is non-empty. */
export const publicEnv = parsed.success
  ? parsed.data
  : { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'missing-anon-key-placeholder', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' };
