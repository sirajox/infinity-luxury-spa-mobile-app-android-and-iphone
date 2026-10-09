import { hhmmToMinutes, minutesToHHMM } from './time';

export interface Interval { start: number; end: number } // minutes from local midnight

/**
 * Pure slot generation used for unit tests and documentation of the rule set.
 * The authoritative implementation is the SQL function `get_available_slots`;
 * the booking transaction re-validates server-side.
 */
export function generateSlots(params: {
  workStart: string;
  workEnd: string;
  durationMin: number;
  bufferMin: number;
  stepMin: number;
  busy: Interval[];
  /** Earliest allowed start, in minutes from local midnight (minimum notice on the current day). */
  notBefore?: number;
}): string[] {
  const { durationMin, bufferMin, stepMin, busy } = params;
  const open = hhmmToMinutes(params.workStart);
  const close = hhmmToMinutes(params.workEnd);
  const slots: string[] = [];
  for (let start = open; start + durationMin <= close; start += stepMin) {
    if (start < (params.notBefore ?? 0)) continue;
    const end = start + durationMin + bufferMin;
    const clash = busy.some((b) => start < b.end && end > b.start);
    if (!clash) slots.push(minutesToHHMM(start));
  }
  return slots;
}
