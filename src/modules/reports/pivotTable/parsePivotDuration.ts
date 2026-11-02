import type { PivotDuration } from './types';

const NANOSECONDS_PER_SECOND = 1_000_000_000;
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_MINUTE = 60;
const DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.(\d{1,9}))?S)?)?$/;

const invalidDuration = (value: string): Error => new Error(`Invalid pivot duration: ${value}`);

export const parsePivotDuration = (value: string): PivotDuration => {
  const match = DURATION_PATTERN.exec(value);

  if (!match) throw invalidDuration(value);

  const [, daysPart, hoursPart, minutesPart, secondsPart, fractionPart] = match;
  const hasDateComponent = daysPart !== undefined;
  const hasTimeComponent = hoursPart !== undefined || minutesPart !== undefined || secondsPart !== undefined;

  if (!hasDateComponent && !hasTimeComponent) throw invalidDuration(value);
  if (value.includes('T') && !hasTimeComponent) throw invalidDuration(value);

  const days = Number(daysPart ?? 0);
  const hours = Number(hoursPart ?? 0);
  const minutes = Number(minutesPart ?? 0);
  const secondsPartValue = Number(secondsPart ?? 0);
  const seconds = days * SECONDS_PER_DAY + hours * SECONDS_PER_HOUR + minutes * SECONDS_PER_MINUTE + secondsPartValue;

  if (![days, hours, minutes, secondsPartValue, seconds].every(Number.isSafeInteger)) {
    throw invalidDuration(value);
  }

  return {
    seconds,
    nanoseconds: Number((fractionPart ?? '').padEnd(9, '0') || 0),
  };
};

export const addPivotDurations = (left: PivotDuration, right: PivotDuration): PivotDuration => {
  const nanoseconds = left.nanoseconds + right.nanoseconds;
  const seconds = left.seconds + right.seconds + Math.floor(nanoseconds / NANOSECONDS_PER_SECOND);

  if (!Number.isSafeInteger(seconds)) throw new Error('Pivot duration sum exceeds safe integer seconds');

  return {
    seconds,
    nanoseconds: nanoseconds % NANOSECONDS_PER_SECOND,
  };
};

export const formatPivotDuration = ({ seconds }: PivotDuration): string => {
  const completeMinutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainingSeconds = seconds % SECONDS_PER_MINUTE;
  const shouldRoundUp = remainingSeconds >= 30;
  const roundedMinutes = completeMinutes + (shouldRoundUp ? 1 : 0);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};
