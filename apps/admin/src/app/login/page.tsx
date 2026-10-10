import Image from 'next/image';
import { ActionForm, TextField } from '@/components/form';
import { Notice } from '@/components/ui';
import { configProblems } from '@/lib/env';
import { signIn } from './actions';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="" width={44} height={44} className="rounded-full" priority />
          <span className="text-xs uppercase tracking-[0.2em] text-white/60">Infinity Luxury Spa &amp; Aesthetics</span>
        </div>
        <div>
          <h1 className="font-serif text-5xl leading-tight">Where Endless<br />Beauty Begins</h1>
          <p className="mt-4 max-w-md text-white/60">Bookings, store, payments and staff in one place.</p>
        </div>
        <p className="text-xs text-white/40">Abuja · Kano · Kaduna · Sokoto</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="font-serif text-3xl">Staff sign in</h2>
          <p className="mb-6 mt-1 text-sm text-grey-600">Use the account your administrator created for you.</p>
          {configProblems.length ? <Notice tone="danger" title="Setup required">Missing configuration: {configProblems.join(', ')}. See apps/admin/.env.example.</Notice> : null}
          <ActionForm action={signIn} submitLabel="Sign in" submitTone="primary">
            <input type="hidden" name="next" value={next ?? ''} />
            <TextField label="Email address" name="email" type="email" autoComplete="email" required />
            <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
          </ActionForm>
        </div>
      </section>
    </main>
  );
}
