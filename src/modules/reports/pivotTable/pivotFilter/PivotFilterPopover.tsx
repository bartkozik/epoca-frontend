import Button from '@/core/theme/button';
import { KeyBoardEventType, useKeyDown, useOnClickOutside } from '@/core/utils/hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFieldLabelKey } from '../pivotFieldBuilder/getFieldLabelKey';
import type { PivotFilter, PivotFilterMember, PivotFilterValue } from '../types';
import styles from './PivotFilterPopover.module.scss';
import { sortPivotFilterMembers } from './sortPivotFilterMembers';

interface PivotFilterPopoverProps {
  filter: PivotFilter;
  members: PivotFilterMember[];
  onApply: (includedValues: PivotFilterValue[] | null) => unknown;
  onOpenChange?: (isOpen: boolean) => void;
  resolveLabel: (value: PivotFilterValue) => string;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const matches = (left: PivotFilterValue, right: PivotFilterValue): boolean => Object.is(left, right);

const cloneSelection = (selection: PivotFilterValue[] | null): PivotFilterValue[] | null =>
  selection === null ? null : [...selection];

function PivotFilterPopover({
  filter,
  members,
  onApply,
  onOpenChange,
  resolveLabel,
}: PivotFilterPopoverProps): JSX.Element {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<PivotFilterValue[] | null>(() => cloneSelection(filter.includedValues));
  const [query, setQuery] = useState('');
  const fieldLabel = t(getFieldLabelKey(filter.key));
  const titleId = `pivot-filter-${filter.key}-title`;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const orderedMembers = useMemo(
    () => sortPivotFilterMembers(filter.key, members, resolveLabel, i18n.language),
    [filter.key, i18n.language, members, resolveLabel],
  );
  const visibleMembers = orderedMembers.filter(({ value }) =>
    resolveLabel(value).toLocaleLowerCase(i18n.language).includes(query.trim().toLocaleLowerCase(i18n.language)),
  );
  const availableMembers = visibleMembers.filter(({ available }) => available);
  const unavailableMembers = visibleMembers.filter(({ available }) => !available);

  const isSelected = (value: PivotFilterValue): boolean =>
    draft === null || draft.some((selected) => matches(selected, value));

  const open = (): void => {
    setDraft(cloneSelection(filter.includedValues));
    setQuery('');
    setIsOpen(true);
    onOpenChange?.(true);
  };
  const cancel = (): void => {
    setDraft(cloneSelection(filter.includedValues));
    setQuery('');
    setIsOpen(false);
    onOpenChange?.(false);
  };
  const toggle = (value: PivotFilterValue): void => {
    setDraft((current) => {
      const selected = current === null ? members.map((member) => member.value) : [...current];
      return selected.some((candidate) => matches(candidate, value))
        ? selected.filter((candidate) => !matches(candidate, value))
        : [...selected, value];
    });
  };
  const apply = (): void => {
    if (draft !== null && draft.length === 0) return;
    void onApply(cloneSelection(draft));
    setIsOpen(false);
    onOpenChange?.(false);
  };

  useOnClickOutside({ condition: isOpen, handler: cancel, ref: rootRef });
  useKeyDown({ action: cancel, isListening: isOpen, keyboardEventType: KeyBoardEventType.ESC });

  useEffect(() => {
    if (!isOpen) return undefined;

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? panel)?.focus();

    return () => {
      triggerRef.current?.focus();
    };
  }, [isOpen]);

  const renderGroup = (labelKey: string, groupMembers: PivotFilterMember[]): JSX.Element | null => {
    if (groupMembers.length === 0) return null;
    return (
      <fieldset aria-label={t(labelKey)} className={styles.group}>
        <legend>{t(labelKey)}</legend>
        {groupMembers.map(({ value }) => {
          const label = resolveLabel(value);
          return (
            <label className={styles.member} key={JSON.stringify(value)}>
              <input checked={isSelected(value)} onChange={() => toggle(value)} type="checkbox" />
              <span>{label}</span>
            </label>
          );
        })}
      </fieldset>
    );
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        aria-haspopup="dialog"
        aria-label={t('pivot_table.filter.configure', { field: fieldLabel })}
        className={styles.trigger}
        onClick={open}
        ref={triggerRef}
        type="button"
      >
        {t('pivot_table.filter.configure_short')}
      </button>
      {isOpen && (
        <div aria-labelledby={titleId} className={styles.panel} ref={panelRef} role="dialog" tabIndex={-1}>
          <h2 id={titleId}>{t('pivot_table.filter.title', { field: fieldLabel })}</h2>
          <input
            aria-label={t('common.search')}
            className={styles.search}
            onChange={({ target }) => setQuery(target.value)}
            placeholder={t('common.search')}
            type="search"
            value={query}
          />
          <div className={styles.bulkActions}>
            <button onClick={() => setDraft(null)} type="button">
              {t('common.select_all')}
            </button>
            <button onClick={() => setDraft([])} type="button">
              {t('common.clear')}
            </button>
          </div>
          <div className={styles.members}>
            {renderGroup('pivot_table.filter.available', availableMembers)}
            {renderGroup('pivot_table.filter.unavailable', unavailableMembers)}
            {visibleMembers.length === 0 && <p>{t('pivot_table.filter.no_results')}</p>}
          </div>
          <div className={styles.actions}>
            <Button label={t('common.cancel')} onClick={cancel} variant="outlined" />
            <Button disabled={draft !== null && draft.length === 0} label={t('common.apply')} onClick={apply} />
          </div>
        </div>
      )}
    </div>
  );
}

export default PivotFilterPopover;
