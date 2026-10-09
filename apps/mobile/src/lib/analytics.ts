/**
 * Privacy-conscious product analytics. Events carry coarse identifiers only (slugs, counts); never payment data,
 * tokens, emails, phone numbers or free-text. Provider integration (e.g. PostHog) plugs into `sink`.
 */
export type AnalyticsEvent =
  | { name: 'app_opened' }
  | { name: 'treatment_viewed'; slug: string }
  | { name: 'product_viewed'; slug: string }
  | { name: 'booking_started'; serviceSlug: string }
  | { name: 'booking_completed'; serviceSlug: string }
  | { name: 'payment_completed'; purpose: string }
  | { name: 'product_purchased'; itemCount: number }
  | { name: 'membership_purchased'; plan: string };

type Sink = (event: AnalyticsEvent) => void;

let sink: Sink | null = null;

export function setAnalyticsSink(next: Sink | null) {
  sink = next;
}

export function track(event: AnalyticsEvent) {
  try {
    if (sink) sink(event);
    else if (__DEV__) console.log('[analytics]', event.name);
  } catch {
    // Analytics must never affect the user experience.
  }
}
