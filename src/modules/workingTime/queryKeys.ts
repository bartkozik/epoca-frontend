import { UnitsDto } from '@/modules/workingTime/types';

export const unitsQueryKey = (organizationSlug: string, dto: UnitsDto): readonly [string, string] => [
  'units',
  JSON.stringify({ organizationSlug, ...dto }),
];
