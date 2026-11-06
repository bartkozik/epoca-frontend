import { ClientFilterType, ClientType } from '@/core/models/enums';

export const checkClientType = <T extends { type: ClientType }>(
  client: T,
  filterType: ClientFilterType,
  query?: string,
): boolean => {
  if (query) return true;
  if (!client) return false;

  switch (filterType) {
    case ClientFilterType.All:
      return true;
    case ClientFilterType.Internal:
      return client.type === ClientType.Internal;
    case ClientFilterType.External:
      return client.type === ClientType.External;
    default:
      return false;
  }
};
