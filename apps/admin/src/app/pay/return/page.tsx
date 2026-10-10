import Image from 'next/image';
import { ReturnRedirect } from './redirect';

export const metadata = { title: 'Returning to the app' };

/**
 * Public landing page that payment providers redirect to after checkout. It hands the customer back to the mobile app
 * through its deep link. Nothing here marks a payment as successful: the app asks the backend, which asks the provider.
 */
export default async function PayReturn({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string; tx_ref?: string }> }) {
  const sp = await searchParams;
  const raw = sp.reference ?? sp.trxref ?? sp.tx_ref ?? '';
  const reference = /^[A-Za-z0-9-]{1,64}$/.test(raw) ? raw : '';
  const scheme = process.env.MOBILE_APP_SCHEME ?? 'infinityspa';
  const link = `${scheme}://payment-return${reference ? `?reference=${encodeURIComponent(reference)}` : ''}`;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <Image src="/logo.png" alt="" width={72} height={72} className="rounded-full" priority />
      <h1 className="font-serif text-3xl">Thank you</h1>
      <p className="text-sm text-grey-600">We are taking you back to the Infinity Luxury Spa app to confirm your payment.</p>
      <a href={link} className="btn-primary">Open the app</a>
      <ReturnRedirect href={link} />
    </main>
  );
}
