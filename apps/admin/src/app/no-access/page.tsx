import { signOut } from '../login/actions';

export const metadata = { title: 'No access' };

export default function NoAccess() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-serif text-3xl">No dashboard access</h1>
      <p className="text-sm text-grey-600">Your account has not been given a staff role. Ask a Super Admin or the business owner to assign one, then sign in again.</p>
      <form action={signOut}><button className="btn-primary">Sign out</button></form>
    </main>
  );
}
