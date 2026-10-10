import { ActionForm, Checkbox, FileField, MoneyField, TextField } from '@/components/form';
import { ConfirmAction } from '@/components/confirm';
import { createClient } from '@/lib/supabase/server';
import { addProductImage, removeProductImage, saveVariant } from './product-actions';

/** Sizes/variants (each with its own price and SKU) and the image gallery for one product. */
export async function ProductExtras({ id, canWrite }: { id: string; canWrite: boolean }) {
  const supabase = await createClient();
  const [variants, images] = await Promise.all([
    supabase.from('product_variants').select('id, name, sku, price_kobo, compare_at_price_kobo, low_stock_threshold, is_active').eq('product_id', id).order('display_order').order('price_kobo'),
    supabase.from('product_images').select('id, url, alt').eq('product_id', id).order('position'),
  ]);
  return (
    <>
      <section className="card p-5">
        <h2 className="mb-1 text-xl">Sizes & prices</h2>
        <p className="mb-4 text-xs text-grey-600">Every product needs at least one variant to be purchasable. Stock is set under Inventory.</p>
        <div className="space-y-5">
          {(variants.data ?? []).map((v) => (
            <ActionForm key={v.id} action={saveVariant} submitLabel="Save" hideSubmit={!canWrite} className="space-y-3 border-t border-grey-200 pt-4 first:border-0 first:pt-0">
              <input type="hidden" name="id" value={v.id} /><input type="hidden" name="product_id" value={id} />
              <div className="grid grid-cols-2 gap-3"><TextField label="Size" name="name" defaultValue={v.name} required /><TextField label="SKU" name="sku" defaultValue={v.sku} required /></div>
              <div className="grid grid-cols-2 gap-3"><MoneyField label="Price" name="price" defaultKobo={Number(v.price_kobo)} required /><MoneyField label="Compare-at" name="compare_at" defaultKobo={v.compare_at_price_kobo === null ? null : Number(v.compare_at_price_kobo)} /></div>
              <TextField label="Low-stock alert at" name="low_stock_threshold" type="number" min={0} defaultValue={v.low_stock_threshold} />
              <Checkbox label="Active" name="is_active" defaultChecked={v.is_active} />
              {canWrite ? <button className="btn-outline btn-sm">Save variant</button> : null}
            </ActionForm>
          ))}
        </div>
        {canWrite ? (
          <details className="mt-5 border-t border-grey-200 pt-4" open={(variants.data ?? []).length === 0}>
            <summary className="cursor-pointer text-sm font-semibold">Add a size</summary>
            <ActionForm action={saveVariant} submitLabel="Add variant" submitTone="gold" className="mt-3 space-y-3">
              <input type="hidden" name="product_id" value={id} /><input type="hidden" name="is_active" value="true" />
              <div className="grid grid-cols-2 gap-3"><TextField label="Size" name="name" placeholder="30 ml" required /><TextField label="SKU" name="sku" required /></div>
              <div className="grid grid-cols-2 gap-3"><MoneyField label="Price" name="price" required /><MoneyField label="Compare-at" name="compare_at" /></div>
              <TextField label="Low-stock alert at" name="low_stock_threshold" type="number" min={0} defaultValue={5} />
            </ActionForm>
          </details>
        ) : null}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-xl">Gallery</h2>
        <ul className="mb-4 grid grid-cols-3 gap-3">
          {(images.data ?? []).map((img) => (
            <li key={img.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded product image */}
              <img src={img.url} alt={img.alt ?? ''} className="aspect-square w-full rounded-xl border border-grey-200 object-cover" />
              {canWrite ? <ConfirmAction small action={removeProductImage} buttonLabel="Remove" title="Remove this image?" body="It disappears from the product page." hidden={{ id: img.id }} /> : null}
            </li>
          ))}
          {(images.data ?? []).length === 0 ? <li className="col-span-3 text-sm text-grey-600">No gallery images yet.</li> : null}
        </ul>
        {canWrite ? (
          <ActionForm action={addProductImage} submitLabel="Upload image" submitTone="outline">
            <input type="hidden" name="product_id" value={id} />
            <FileField label="Image" name="file" />
            <TextField label="Description (for accessibility)" name="alt" />
          </ActionForm>
        ) : null}
      </section>
    </>
  );
}
