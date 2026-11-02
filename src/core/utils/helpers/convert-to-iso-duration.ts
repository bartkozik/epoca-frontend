import dayjs from 'dayjs';
import durationPlugin from 'dayjs/plugin/duration';

dayjs.extend(durationPlugin);

export function convertToIsoDuration(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const isoDuration = dayjs.duration({ hours, minutes }).toISOString();
  return isoDuration;
}
