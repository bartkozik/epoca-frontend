import type { MultiSearchOptionMeta, SelectOption } from '@/core/theme/inputs';

export type MultiSearchGroup = 'selected' | 'active' | 'inactive' | 'archived';

export interface MultiSearchOrderedItem {
  value: string;
  group: MultiSearchGroup;
}

const GROUP_ORDER: MultiSearchGroup[] = ['selected', 'active', 'inactive', 'archived'];

export const groupOf = (
  item: SelectOption,
  selectedValues: ReadonlySet<string>,
  optionMeta?: Readonly<Record<string, MultiSearchOptionMeta>>,
): MultiSearchGroup => {
  if (selectedValues.has(item.value)) return 'selected';
  const inactive = optionMeta?.[item.value]?.inactive ?? false;
  if (item.archivedStatus && (inactive || !optionMeta)) return 'archived';
  return inactive ? 'inactive' : 'active';
};

/**
 * Orders options once, when the list opens: selected first, then options with data in the current
 * context, then options without data, then archived options. The caller keeps this order frozen while
 * the list stays open, so toggling an option never moves a row under the pointer.
 */
export const orderMultiSearchItems = (
  items: readonly SelectOption[],
  selectedValues: ReadonlySet<string>,
  locale: string,
  optionMeta?: Readonly<Record<string, MultiSearchOptionMeta>>,
): MultiSearchOrderedItem[] => {
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  const compare = (first: SelectOption, second: SelectOption): number =>
    collator.compare(first.label, second.label) ||
    (first.value < second.value ? -1 : first.value > second.value ? 1 : 0);

  const grouped = new Map<MultiSearchGroup, SelectOption[]>(GROUP_ORDER.map((group) => [group, []]));
  items.forEach((item) => grouped.get(groupOf(item, selectedValues, optionMeta))?.push(item));

  return GROUP_ORDER.flatMap((group) =>
    [...(grouped.get(group) ?? [])].sort(compare).map((item) => ({ value: item.value, group })),
  );
};
