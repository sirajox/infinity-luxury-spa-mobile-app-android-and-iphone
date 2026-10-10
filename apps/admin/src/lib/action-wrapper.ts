import 'server-only';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import type { z } from 'zod';
import { requireAccess } from './auth';
import { createClient } from './supabase/server';
import { UserError, formToObject, zodFieldErrors, type ActionState } from './actions';

type Supabase = Awaited<ReturnType<typeof createClient>>;
export interface ActionContext { supabase: Supabase; userId: string }

/**
 * Wraps a server action: authenticates and permission-checks, validates the form with zod, and turns expected
 * failures into form messages. Unexpected errors are logged and shown as a generic message (never raw details).
 * RLS remains the real gate: even a forged request can only do what the staff member's database role allows.
 */
export function formAction<S extends z.ZodType>(
  options: { permission?: string; schema: S },
  handler: (data: z.output<S>, ctx: ActionContext, raw: FormData) => Promise<string | void>,
) {
  return async (_prev: ActionState, fd: FormData): Promise<ActionState> => {
    const { user } = await requireAccess(options.permission);
    const parsed = options.schema.safeParse(formToObject(fd));
    if (!parsed.success) {
      const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
      return { error: 'Please fix the highlighted fields.', fieldErrors: zodFieldErrors(parsed.error), values };
    }
    try {
      const supabase = await createClient();
      const ok = await handler(parsed.data, { supabase, userId: user.id }, fd);
      return { ok: ok ?? 'Saved.' };
    } catch (error) {
      if (isRedirectError(error)) throw error;
      if (error instanceof UserError) return { error: error.message };
      console.error('action failed', error);
      return { error: 'Something went wrong. Please try again.' };
    }
  };
}
