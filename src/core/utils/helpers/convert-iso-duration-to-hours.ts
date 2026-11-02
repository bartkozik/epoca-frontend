import dayjs from 'dayjs';
import durationPlugin from 'dayjs/plugin/duration';

dayjs.extend(durationPlugin);

export function convertIsoDurationToHours(isoDuration: string): number {
  const duration = dayjs.duration(isoDuration);
  const hours = duration.asHours();
  return hours;
}
