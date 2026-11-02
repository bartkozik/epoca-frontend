import { UnitsDto } from '@/modules/workingTime/types';

// Flat, entity-prefixed key (this repo's tanstack-query convention, see clients/queryKeys.ts's
// clientsQueryKey) -- 'units' is the stable prefix every read/invalidation shares, with
// organizationSlug + dto JSON-stringified together as the second segment since this is a
// parameterized list query.
export const unitsQueryKey = (organizationSlug: string, dto: UnitsDto): readonly [string, string] => [
  'units',
  JSON.stringify({ organizationSlug, ...dto }),
];
