import { convertTimeFormat, formatDate } from '@/core/utils/helpers';
import type { RawReportedUnit, UnitFormatting } from './types';

interface ContextOrganizationUser {
  id: string;
  fullName: string;
  email: string;
}

export const modelUnit = <T extends RawReportedUnit>(
  raw: T,
  contextOrganizationUsers: ContextOrganizationUser[],
  index = 0,
): Omit<T, 'userFullName'> & UnitFormatting => {
  const user = contextOrganizationUsers.find(({ id }) => id === raw.userId) || null;

  return {
    ...raw,
    formattedDuration: convertTimeFormat({ time: raw.duration }) || '',
    formattedReportDuration: convertTimeFormat({ time: raw.duration, fractionalHour: true, includeColons: true }) || '',
    formattedCreatedAt: formatDate(raw.createdAt) || '',
    formattedDate: formatDate(raw.date) || '',
    userFullName: (user?.fullName || user?.email || raw.userFullName) ?? undefined,
    convertedDate: new Date(raw.date),
    sequenceIndex: index,
  };
};
