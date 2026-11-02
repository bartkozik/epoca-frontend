import dayjs from 'dayjs';
import durationPlugin from 'dayjs/plugin/duration';

dayjs.extend(durationPlugin);

interface FormatTimeData {
  hours: number;
  minutes: number;
  formatAsFractional: boolean;
  isPTincluded?: boolean;
  includeColons?: boolean;
}

const formatTime = ({
  hours,
  minutes,
  formatAsFractional,
  isPTincluded,
  includeColons = false,
}: FormatTimeData): string => {
  if (formatAsFractional) {
    return includeColons
      ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
      : (hours + minutes / 60).toFixed(2) + 'h';
  } else {
    return isPTincluded
      ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
      : `PT${hours}H${minutes}M`;
  }
};

interface ConvertTimeData {
  time?: string | number;
  fractionalHour?: boolean;
  includeColons?: boolean;
}

interface ParsedTimeData {
  totalMinutes: number;
  isPTincluded: boolean;
}

const parseTotalMinutes = (time: string | number): ParsedTimeData => {
  if (typeof time === 'number') {
    return {
      totalMinutes: Math.round(time * 60),
      isPTincluded: false,
    };
  }

  if (time.includes('PT')) {
    return {
      totalMinutes: Math.round(dayjs.duration(time).asMinutes()),
      isPTincluded: true,
    };
  }

  if (time.includes(':')) {
    const [hours, minutes] = time.split(':').map((component) => parseInt(component, 10));

    return {
      totalMinutes: hours * 60 + minutes,
      isPTincluded: false,
    };
  }

  return {
    totalMinutes: Math.round(parseFloat(time.replace(',', '.')) * 60),
    isPTincluded: false,
  };
};

export const convertTimeFormat = ({ time, fractionalHour = false, includeColons = false }: ConvertTimeData): string => {
  if (time === undefined || time === null || time === '') return '';

  const { totalMinutes, isPTincluded } = parseTotalMinutes(time);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return formatTime({
    hours,
    minutes,
    formatAsFractional: fractionalHour,
    isPTincluded,
    includeColons,
  });
};
