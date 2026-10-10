'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { emailSchema } from '@infinity/core';
import { createClient } from '@/lib/supabase/server';
import type { ActionState } from '@/lib/actions';

const schema = z.object({ email: emailSchema, password: z.string().min(1), next: z.string().optional() });

/** Only same-site paths are honoured, so the login form cannot be used as an open redirect. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/';
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ email: formData.get('email'), password: formData.get('password'), next: formData.get('next') ?? undefined });
  if (!parsed.success) return { error: 'Enter your email and password.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  // One message for every failure so the form cannot be used to discover which emails have accounts.
  if (error) return { error: 'Incorrect email or password.' };

  const { data: isStaff } = await supabase.rpc('is_staff');
  if (!isStaff) {
    await supabase.auth.signOut();
    return { error: 'This account does not have dashboard access. Customers can use the mobile app.' };
  }
  redirect(safeNext(parsed.data.next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
