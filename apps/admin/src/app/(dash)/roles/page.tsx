import { ActionForm } from '@/components/form';
import { Notice, PageHeader } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { saveRolePermissions } from './actions';

export const metadata = { title: 'Roles & permissions' };

/** One card per role with a checkbox per permission. Changes are audited and take effect on the next request. */
export default async function Roles() {
  await requireAccess('roles.manage');
  const supabase = await createClient();
  const [roles, perms, links] = await Promise.all([
    supabase.from('roles').select('id, key, name, description').order('name'),
    supabase.from('permissions').select('key').order('key'),
    supabase.from('role_permissions').select('role_id, permission_key'),
  ]);
  const groups = new Map<string, string[]>();
  for (const p of perms.data ?? []) {
    const area = p.key.split('.')[0] as string;
    groups.set(area, [...(groups.get(area) ?? []), p.key]);
  }
  const has = (roleId: string) => new Set((links.data ?? []).filter((l) => l.role_id === roleId).map((l) => l.permission_key));

  return (
    <>
      <PageHeader title="Roles & permissions" description="Decide what each role can do. A permission can be limited to one branch when you assign the role to a person." />
      <Notice tone="gold" title="Be careful with sensitive permissions">refunds.create, inventory.adjust, users.manage, roles.manage and settings.manage change money, stock or access. Every change here is written to the audit log.</Notice>
      <div className="space-y-6">
        {(roles.data ?? []).map((r) => {
          const mine = has(r.id);
          const locked = r.key === 'super_admin';
          return (
            <section key={r.id} className="card p-6">
              <h2 className="text-xl">{r.name}</h2>
              <p className="mb-4 text-sm text-grey-600">{r.description}{locked ? ' This role always has every permission.' : ''}</p>
              <ActionForm action={saveRolePermissions} submitLabel="Save permissions" hideSubmit={locked}>
                <input type="hidden" name="role_id" value={r.id} />
                <fieldset disabled={locked} className="grid gap-x-6 gap-y-4 border-0 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {[...groups.entries()].map(([area, keys]) => (
                    <div key={area}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-grey-600">{area}</p>
                      {keys.map((k) => (
                        <label key={k} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                          <input type="checkbox" name="permissions" value={k} defaultChecked={locked || mine.has(k)} className="size-4 accent-[#a68917]" /> {k.split('.')[1]}
                        </label>
                      ))}
                    </div>
                  ))}
                </fieldset>
              </ActionForm>
            </section>
          );
        })}
      </div>
    </>
  );
}
