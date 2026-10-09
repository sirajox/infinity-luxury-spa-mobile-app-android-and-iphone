import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';
import { AppError } from './errors';

export interface CalendarEvent {
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  notes?: string;
  timeZone: string;
}

/** Adds an appointment to the user's calendar after asking permission. Returns the created event id. */
export async function addToCalendar(event: CalendarEvent): Promise<string> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') {
    throw new AppError('calendar_denied', 'Allow calendar access in your device settings to add appointments.');
  }
  let calendarId: string | undefined;
  if (Platform.OS === 'ios') {
    calendarId = (await Calendar.getDefaultCalendarAsync()).id;
  } else {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    calendarId = (calendars.find((c) => c.isPrimary && c.allowsModifications) ?? calendars.find((c) => c.allowsModifications))?.id;
  }
  if (!calendarId) throw new AppError('calendar_unavailable', 'No writable calendar was found on this device.');
  return Calendar.createEventAsync(calendarId, {
    title: event.title,
    startDate: new Date(event.startsAt),
    endDate: new Date(event.endsAt),
    location: event.location,
    notes: event.notes,
    timeZone: event.timeZone,
    alarms: [{ relativeOffset: -120 }, { relativeOffset: -1440 }],
  });
}
