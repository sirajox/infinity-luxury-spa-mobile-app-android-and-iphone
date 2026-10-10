import { createElement } from 'react';
import { Shell } from '@/components/shell';
import { requireAccess } from '@/lib/auth';
import { NAV } from '@/lib/nav';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '../login/actions';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const { user, access } = await requireAccess();
  const supabase = await createClient();
  const { data: roles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id).returns<{ roles: { name: string } | null }[]>();

  const groups = NAV.map((g) => ({
    title: g.title,
    items: g.items.filter((i) => i.permission === '' || access.hasAny(i.permission)).map((i) => ({ href: i.href, label: i.label, iconName: i.href })),
  })).filter((g) => g.items.length > 0);

  // Icons are rendered on the server and passed down as elements (component functions cannot cross the boundary).
  const icons = Object.fromEntries(NAV.flatMap((g) => g.items).map((i) => [i.href, createElement(i.icon, { className: 'size-full', strokeWidth: 1.6 })]));
  const roleLabel = [...new Set((roles ?? []).map((r) => r.roles?.name).filter(Boolean))].join(', ') || 'Staff';

  return (
    <Shell groups={groups} icons={icons} user={{ email: user.email ?? '', role: roleLabel }} signOut={signOut}>
      {children}
    </Shell>
  );
}
