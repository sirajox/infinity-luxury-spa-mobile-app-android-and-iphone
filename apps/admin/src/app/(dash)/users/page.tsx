import { ConfirmAction } from '@/components/confirm';
import { ActionForm, SelectField, TextField } from '@/components/form';
import { Badge, DataTable, EmptyBox, Notice, PageHeader } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDate } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { serviceRoleConfigured } from '@/lib/supabase/admin';
import { addStaffRole, revokeRole } from './actions';

export const metadata = { title: 'Users' };

interface Grant { id: string; user_id: string; created_at: string; roles: { name: string; key: string } | null; branches: { name: string } | null }

export default async function Users() {
  await requireAccess('users.manage');
  const supabase = await createClient();
  const [grants, roles, branches] = await Promise.all([
    supabase.from('user_roles').select('id, user_id, created_at, roles(name, key), branches(name)').order('created_at', { ascending: false }).returns<Grant[]>(),
    supabase.from('roles').select('id, name, key').order('name'),
    supabase.from('branches').select('id, name').eq('is_active', true).order('display_order'),
  ]);
  const ids = [...new Set((grants.data ?? []).map((g) => g.user_id))];
  const { data: profiles } = ids.length ? await supabase.from('profiles').select('id, full_name, email').in('id', ids) : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (
    <>
      <PageHeader title="Users" description="Who can sign in to this dashboard, and what they can do. Roles can be limited to a single branch." />
      {!serviceRoleConfigured() ? <Notice tone="gold" title="Invitations are off">Staff must first create an account in the customer app; then add their email below to give them a role. Set SUPABASE_SERVICE_ROLE_KEY on the server to invite people by email instead.</Notice> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="card overflow-hidden">
          <DataTable rows={grants.data ?? []} rowKey={(g) => g.id} empty={<EmptyBox title="No staff yet" />}
            columns={[
              { header: 'Person', cell: (g) => <><span className="font-medium">{byId.get(g.user_id)?.full_name ?? 'Unnamed'}</span><br /><span className="text-xs text-grey-600">{byId.get(g.user_id)?.email ?? g.user_id}</span></> },
              { header: 'Role', cell: (g) => <Badge tone={g.roles?.key === 'super_admin' ? 'dark' : 'gold'}>{g.roles?.name}</Badge> },
              { header: 'Scope', cell: (g) => g.branches?.name ?? 'All branches' },
              { header: 'Since', cell: (g) => fmtDate(g.created_at) },
              { header: '', cell: (g) => <ConfirmAction small action={revokeRole} buttonLabel="Remove" title="Remove this role?" confirmLabel="Remove role" hidden={{ id: g.id }} body="They lose the access this role gave them immediately. You cannot remove your own roles." /> },
            ]} />
        </div>
        <aside className="card h-fit p-5"><h2 className="mb-3 text-xl">Add staff</h2>
          <ActionForm action={addStaffRole} submitLabel="Give access" submitTone="gold">
            <TextField label="Email address" name="email" type="email" required />
            <TextField label="Full name (for invitations)" name="full_name" />
            <SelectField label="Role" name="role" options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} />
            <SelectField label="Limit to branch" name="branch" allowEmpty emptyLabel="All branches" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} help="Branch-limited roles only apply to that branch's bookings, orders and stock." />
          </ActionForm>
        </aside>
      </div>
    </>
  );
}
