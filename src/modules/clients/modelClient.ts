import { DATE_FORMAT, formatDate } from '@/core/utils/helpers';
import { Client, RawClient } from '@/modules/clients/types';

export const toClient = (raw: RawClient): Client => ({
  ...raw,
  archived: !!raw.archivedAt,
  archivedDate: formatDate(raw.archivedAt),
  formattedCreatedAt: formatDate(raw.createdAt, DATE_FORMAT.DAY_WITH_DOT) || '',
  projects: [],
});
