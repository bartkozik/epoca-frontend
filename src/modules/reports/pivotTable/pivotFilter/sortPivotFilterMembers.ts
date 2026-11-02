import { PIVOT_KEY, type PivotKey } from '../constants';
import type { PivotFilterMember, PivotFilterValue } from '../types';

type ResolveLabel = (value: PivotFilterValue) => string;

const rawValue = (value: PivotFilterValue): string => (value === null ? '' : String(value));

const compareTypedValues = (
  key: PivotKey,
  left: PivotFilterMember,
  right: PivotFilterMember,
  resolveLabel: ResolveLabel,
  collator: Intl.Collator,
): number => {
  if (key === PIVOT_KEY.YEAR) return Number(left.value) - Number(right.value);
  if (key === PIVOT_KEY.MONTH_YEAR || key === PIVOT_KEY.DATE) {
    return rawValue(left.value).localeCompare(rawValue(right.value));
  }
  if (key === PIVOT_KEY.ENTRY_TYPE) {
    const order = { Worklog: 0, Note: 1 } as const;
    return order[left.value as keyof typeof order] - order[right.value as keyof typeof order];
  }

  const labelResult = collator.compare(resolveLabel(left.value), resolveLabel(right.value));
  return labelResult || rawValue(left.value).localeCompare(rawValue(right.value));
};

export const sortPivotFilterMembers = (
  key: PivotKey,
  members: readonly PivotFilterMember[],
  resolveLabel: ResolveLabel,
  locale?: string,
): PivotFilterMember[] => {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const compare = (left: PivotFilterMember, right: PivotFilterMember): number =>
    compareTypedValues(key, left, right, resolveLabel, collator);
  const available = members.filter((member) => member.available).sort(compare);
  const unavailable = members.filter((member) => !member.available).sort(compare);
  return [...available, ...unavailable];
};
