import Link from 'next/link';

export const metadata = { title: 'Not permitted' };

export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-serif text-3xl">You do not have permission</h1>
      <p className="text-sm text-grey-600">Your role does not include this area. If you need it, ask a Super Admin or the business owner.</p>
      <Link href="/" className="btn-primary">Back to dashboard</Link>
    </main>
  );
}
