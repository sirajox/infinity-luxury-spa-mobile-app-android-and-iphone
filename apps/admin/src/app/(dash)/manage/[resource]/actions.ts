'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError, type ActionState } from '@/lib/actions';
import { requireAccess } from '@/lib/auth';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, buildSchema, columnOf, from, pkOf, syncJoin, toRow } from '@/lib/resources/engine';
import { resourceBySlug } from '@/lib/resources/defs';

/** Create or update any resource from `lib/resources/defs.ts`. Permission, validation and RLS are all enforced here and in the database. */
export async function saveResource(prev: ActionState, fd: FormData): Promise<ActionState> {
  const def = resourceBySlug(String(fd.get('_resource') ?? ''));
  if (!def) return { error: 'Unknown record type.' };
  const id = String(fd.get('_id') ?? '') || null;
  const mode = id ? 'update' : 'create';
  if (mode === 'create' && def.allowCreate === false) return { error: 'New records cannot be added here.' };

  return formAction({ permission: def.write, schema: buildSchema(def) }, async (data, { supabase }, raw) => {
    const values: Record<string, unknown> = { ...data };

    // Image uploads go to Storage with the staff member's own session, so bucket policies apply.
    for (const f of def.fields.filter((x) => x.type === 'image')) {
      const file = raw.get(`${f.name}__file`);
      if (raw.get(`${f.name}__clear`) === 'true') values[f.name] = undefined;
      if (file instanceof File && file.size > 0) {
        const ext = IMAGE_TYPES[file.type];
        if (!ext) throw new UserError(`${f.label}: use a JPEG, PNG or WebP image.`);
        if (file.size > MAX_IMAGE_BYTES) throw new UserError(`${f.label}: the image must be 5 MB or smaller.`);
        const path = `${def.slug}/${randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(f.bucket as string).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
        if (error) throw new UserError(describeDbError(error));
        values[f.name] = supabase.storage.from(f.bucket as string).getPublicUrl(path).data.publicUrl;
      }
    }

    let row: Record<string, unknown>;
    try { row = toRow(def, values, mode); } catch (e) { throw new UserError((e as Error).message); }
    // uuid[] columns (coupons.branch_ids, packages.branch_ids …) are plain columns, not join tables.
    for (const f of def.fields.filter((x) => x.type === 'uuids')) row[columnOf(f)] = values[f.name] ?? [];

    let savedId = id;
    if (mode === 'create') {
      const { data: created, error } = await from(supabase, def.table).insert(row).select(pkOf(def)).single();
      if (error) throw new UserError(describeDbError(error));
      savedId = String((created as Record<string, unknown>)[pkOf(def)]);
    } else {
      const { error } = await from(supabase, def.table).update(row).eq(pkOf(def), id).select(pkOf(def)).single();
      if (error) throw new UserError(describeDbError(error));
    }
    for (const j of def.joins ?? []) await syncJoin(supabase, j, savedId as string, (values[j.name] as string[]) ?? []);

    revalidatePath(`/manage/${def.slug}`);
    if (mode === 'create') redirect(`/manage/${def.slug}/${encodeURIComponent(savedId as string)}?ok=${encodeURIComponent(`${def.singular[0]?.toUpperCase()}${def.singular.slice(1)} created.`)}`);
    return 'Saved.';
  })(prev, fd);
}

const deleteSchema = z.object({ _resource: z.string(), _id: z.string().min(1) });

export async function deleteResource(prev: ActionState, fd: FormData): Promise<ActionState> {
  const def = resourceBySlug(String(fd.get('_resource') ?? ''));
  if (!def || !def.deletable) return { error: 'This record cannot be deleted. Deactivate it instead.' };
  return formAction({ permission: def.write, schema: deleteSchema }, async (data, { supabase }) => {
    const { error } = await from(supabase, def.table).delete().eq(pkOf(def), data._id);
    if (error) throw new UserError(describeDbError(error));
    revalidatePath(`/manage/${def.slug}`);
    redirect(`/manage/${def.slug}?ok=${encodeURIComponent('Deleted.')}`);
  })(prev, fd);
}

/** Convenience used by extras that need the signed-in staff member without a form schema. */
export async function currentUserId() {
  return (await requireAccess()).user.id;
}
