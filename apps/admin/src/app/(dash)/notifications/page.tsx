import { ConfirmAction } from '@/components/confirm';
import { SelectField, TextArea, TextField } from '@/components/form';
import { Notice, PageHeader } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { sendBroadcast } from './actions';

export const metadata = { title: 'Notifications' };

export default async function Notifications() {
  await requireAccess('notifications.send');
  const supabase = await createClient();
  const { data: branches } = await supabase.from('branches').select('id, name').eq('is_active', true).order('display_order');
  return (
    <>
      <PageHeader title="Send a notification" description="Announcements and offers appear in each customer’s notification list and as a push message." />
      <Notice tone="gold" title="Consent is enforced">Offers are only delivered to customers who opted in to marketing. System notices go to everyone in the audience.</Notice>
      <section className="card max-w-2xl p-6">
        <ConfirmAction action={sendBroadcast} buttonLabel="Compose broadcast" tone="primary" title="Send this notification?" confirmLabel="Send now"
          body="This reaches real customers immediately and cannot be recalled. Check the wording carefully.">
          <div className="space-y-4">
            <TextField label="Title" name="title" required />
            <TextArea label="Message" name="body" rows={3} />
            <SelectField label="Type" name="kind" options={[{ value: 'offer', label: 'Offer / promotion (opted-in customers only)' }, { value: 'system', label: 'Service announcement (everyone)' }]} />
            <SelectField label="Audience" name="segment" options={[{ value: 'all', label: 'All customers' }, { value: 'recent_customers', label: 'Customers who booked in the last 90 days' }, { value: 'branch', label: 'Customers whose preferred branch is…' }]} />
            <SelectField label="Branch (for branch audience)" name="branch" allowEmpty emptyLabel="—" options={(branches ?? []).map((b) => ({ value: b.id, label: b.name }))} />
          </div>
        </ConfirmAction>
      </section>
    </>
  );
}
