import { SelectOption } from '@/core/theme/inputs';

interface SearchableItem {
  archived: boolean;
  name?: string;
  email?: string;
  client?: { name?: string };
}

function isUser(item: SearchableItem): item is SearchableItem & { email: string } {
  return item.email !== undefined;
}

export function createSearchOptions<T extends SearchableItem>(
  items: T[],
  valueKey: keyof T,
  labelKey: keyof T,
): SelectOption[] {
  const sortedItems = items.slice().sort((a, b) => {
    const labelA = a.name as string;
    const labelB = b.name as string;
    return labelA.localeCompare(labelB);
  });

  return sortedItems.map((item) => {
    const option: SelectOption = isUser(item)
      ? {
          value: item[valueKey] as string,
          label: item[labelKey] as string,
          archivedStatus: item.archived,
          email: item.email,
        }
      : {
          value: item[valueKey] as string,
          label: item[labelKey] as string,
          archivedStatus: item.archived,
        };

    if (item.client) {
      option.clientName = item.client.name;
    }

    return option;
  });
}
