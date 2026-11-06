import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import { Input } from '@/core/theme/inputs';
import { useOnClickOutside } from '@/core/utils/hooks';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { MultiSearchProps, SelectOption } from '../inputs/types';
import styles from './MultiSearch.module.scss';
import { groupOf, MultiSearchGroup, MultiSearchOrderedItem, orderMultiSearchItems } from './orderMultiSearchItems';

type Row =
  | { kind: 'heading'; key: string; text: string }
  | { kind: 'divider'; key: string }
  | { kind: 'archivedToggle'; key: string; count: number }
  | { kind: 'option'; key: string; item: SelectOption; group: MultiSearchGroup };

const matchesQuery = (item: SelectOption, query: string, locale: string): boolean => {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase(locale);
  return (
    item.label.toLocaleLowerCase(locale).includes(normalized) ||
    (item.email?.toLocaleLowerCase(locale).includes(normalized) ?? false)
  );
};

const MultiSearch = ({
  className,
  items,
  value,
  onChange,
  label = '',
  name,
  placeholder,
  allLabel,
  searchPlaceholder,
  optionMeta,
  inactiveGroupLabel,
  metaStatus,
  onOpen,
  emptyItemsMessage,
  alignRight = false,
  readOnly = false,
}: MultiSearchProps): JSX.Element => {
  const { t, i18n } = useTranslation();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [frozenOrder, setFrozenOrder] = useState<MultiSearchOrderedItem[] | null>(null);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const selectedValues = useMemo(() => new Set(value), [value]);
  const itemsByValue = useMemo(() => new Map(items.map((item) => [item.value, item])), [items]);

  const open = (): void => {
    if (readOnly || isOpen) return;
    setFrozenOrder(orderMultiSearchItems(items, selectedValues, i18n.language, optionMeta));
    setQuery('');
    setArchivedExpanded(false);
    setHighlighted(null);
    setIsOpen(true);
    onOpen?.();
  };

  const close = (): void => {
    setIsOpen(false);
    setFrozenOrder(null);
    setQuery('');
    setHighlighted(null);
  };

  useOnClickOutside({ ref: rootRef, handler: () => isOpen && close() });

  const orderedItems = useMemo((): MultiSearchOrderedItem[] => {
    if (!frozenOrder) return [];
    const known = new Set(frozenOrder.map(({ value: itemValue }) => itemValue));
    const late = orderMultiSearchItems(
      items.filter((item) => !known.has(item.value)),
      selectedValues,
      i18n.language,
      optionMeta,
    );
    return [...frozenOrder.filter(({ value: itemValue }) => itemsByValue.has(itemValue)), ...late];
  }, [frozenOrder, i18n.language, items, itemsByValue, optionMeta, selectedValues]);

  const rows = useMemo((): Row[] => {
    const result: Row[] = [];
    const visible = orderedItems
      .map(({ value: itemValue, group }) => ({ item: itemsByValue.get(itemValue)!, group }))
      .filter(({ item }) => matchesQuery(item, query, i18n.language));

    const inGroup = (group: MultiSearchGroup): typeof visible => visible.filter((entry) => entry.group === group);
    const pushOptions = (entries: { item: SelectOption; group: MultiSearchGroup }[]): void => {
      entries.forEach(({ item, group }) => result.push({ kind: 'option', key: item.value, item, group }));
    };

    const selected = inGroup('selected');
    const active = inGroup('active');
    const inactive = inGroup('inactive');
    const archived = inGroup('archived');

    if (selected.length > 0) {
      result.push({
        kind: 'heading',
        key: 'selected-heading',
        text: t('common.multi_search.selected_group', { count: selected.length }),
      });
      pushOptions(selected);
      if (active.length > 0) result.push({ kind: 'divider', key: 'selected-divider' });
    }
    pushOptions(active);
    if (inactive.length > 0) {
      result.push({
        kind: 'heading',
        key: 'inactive-heading',
        text: inactiveGroupLabel ?? t('common.multi_search.no_data_group'),
      });
      pushOptions(inactive);
    }
    if (archived.length > 0) {
      if (query || archivedExpanded) {
        result.push({
          kind: 'heading',
          key: 'archived-heading',
          text: t('common.multi_search.archived_group', { count: archived.length }),
        });
        pushOptions(archived);
      } else {
        result.push({ kind: 'archivedToggle', key: 'archived-toggle', count: archived.length });
      }
    }
    return result;
  }, [archivedExpanded, i18n.language, inactiveGroupLabel, itemsByValue, orderedItems, query, t]);

  const optionRows = useMemo(
    () => rows.filter((row): row is Extract<Row, { kind: 'option' }> => row.kind === 'option'),
    [rows],
  );
  const optionId = (itemValue: string): string => `${listId}-option-${itemValue}`;

  useEffect(() => {
    if (!highlighted || !optionsRef.current) return;
    document.getElementById(`${listId}-option-${highlighted}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [highlighted, listId]);

  const toggle = (itemValue: string): void => {
    if (readOnly) return;
    onChange(
      selectedValues.has(itemValue)
        ? value.filter((selectedValue) => selectedValue !== itemValue)
        : [...value, itemValue],
    );
  };

  const unselectedMatches = query
    ? optionRows.filter(({ item }) => !selectedValues.has(item.value)).map(({ item }) => item.value)
    : [];

  const moveHighlight = (step: number | 'first' | 'last'): void => {
    if (optionRows.length === 0) return;
    const currentIndex = optionRows.findIndex(({ item }) => item.value === highlighted);
    let nextIndex: number;
    if (step === 'first') nextIndex = 0;
    else if (step === 'last') nextIndex = optionRows.length - 1;
    else if (currentIndex === -1) nextIndex = step > 0 ? 0 : optionRows.length - 1;
    else nextIndex = (currentIndex + step + optionRows.length) % optionRows.length;
    setHighlighted(optionRows[nextIndex].item.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (readOnly) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!isOpen) open();
        else moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Home':
      case 'End':
        if (!isOpen) return;
        event.preventDefault();
        moveHighlight(event.key === 'Home' ? 'first' : 'last');
        break;
      case 'Enter':
        event.preventDefault();
        if (!isOpen) open();
        else if (highlighted) toggle(highlighted);
        break;
      case ' ':
        if (isOpen && !query && highlighted) {
          event.preventDefault();
          toggle(highlighted);
        }
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
      case 'Tab':
        if (isOpen) close();
        break;
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    if (!isOpen) {
      open();
      setQuery((event.nativeEvent as InputEvent).data ?? '');
      return;
    }
    setQuery(event.target.value);
    setHighlighted(null);
  };

  const selectedLabels = value.map((selectedValue) => itemsByValue.get(selectedValue)?.label ?? null);
  const closedText = (() => {
    if (value.length === 0) return '';
    const [first] = selectedLabels;
    if (!first) return t('common.multi_search.selected_count', { count: value.length });
    return value.length === 1 ? first : `${first} +${value.length - 1}`;
  })();

  const emptyMessage =
    items.length === 0 ? (emptyItemsMessage ?? t('common.multi_search.no_options')) : t('common.no_results_found');

  return (
    <div ref={rootRef} className={clsx(styles.root, className)}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={name}>
          {label}
        </label>
        {value.length > 0 && !readOnly && (
          <button type="button" className={styles.clear} onClick={() => onChange([])}>
            {t('common.clear')}
          </button>
        )}
      </div>
      <div className={styles.inputContainer}>
        <Input
          autoCompleteOff
          className={styles.input}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          aria-activedescendant={isOpen && highlighted ? optionId(highlighted) : undefined}
          aria-haspopup="listbox"
          value={isOpen ? query : closedText}
          placeholder={isOpen ? (searchPlaceholder ?? placeholder) : (allLabel ?? placeholder)}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onClick={open}
          readOnly={readOnly}
          size="small"
          icon={
            <Icon
              className={styles.searchIcon}
              icon={isOpen && query ? icons.x : icons.search}
              width={24}
              height={16}
              onClick={() => (isOpen && query ? setQuery('') : undefined)}
            />
          }
        />
        {isOpen && (
          <div className={clsx(styles.panel, { [styles.panelRight]: alignRight })}>
            {metaStatus && <div className={styles.metaStatus}>{metaStatus}</div>}
            {unselectedMatches.length > 0 && (
              <Button
                className={styles.selectMatching}
                label={t('common.multi_search.select_matching', { count: unselectedMatches.length })}
                onClick={() => onChange([...value, ...unselectedMatches])}
                size="small"
                variant="text"
              />
            )}
            <div ref={optionsRef} className={styles.options} data-testid="multi-search-options">
              {optionRows.length === 0 && !rows.some((row) => row.kind === 'archivedToggle') ? (
                <p className={styles.emptyState}>{emptyMessage}</p>
              ) : (
                <ul id={listId} className={styles.list} role="listbox" aria-multiselectable="true" aria-label={label}>
                  {rows.map((row) => {
                    if (row.kind === 'heading')
                      return (
                        <li key={row.key} role="presentation" className={styles.groupHeading}>
                          {row.text}
                        </li>
                      );
                    if (row.kind === 'divider')
                      return <li key={row.key} role="presentation" className={styles.divider} />;
                    if (row.kind === 'archivedToggle')
                      return (
                        <li key={row.key} role="presentation" className={styles.archivedToggleRow}>
                          <button
                            type="button"
                            className={styles.archivedToggle}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setArchivedExpanded(true)}
                          >
                            <Icon icon={icons.arrowRight} width={8} height={12} />
                            {t('common.multi_search.archived_group', { count: row.count })}
                          </button>
                        </li>
                      );

                    const { item } = row;
                    const isSelected = selectedValues.has(item.value);
                    const meta = optionMeta?.[item.value];
                    const currentGroup = groupOf(item, selectedValues, optionMeta);
                    return (
                      <li
                        key={row.key}
                        id={optionId(item.value)}
                        role="option"
                        aria-selected={isSelected}
                        className={clsx(styles.option, {
                          [styles.optionHighlighted]: highlighted === item.value,
                          [styles.optionInactive]: currentGroup === 'inactive' || meta?.inactive,
                        })}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setHighlighted(item.value)}
                        onClick={() => toggle(item.value)}
                      >
                        <span className={clsx(styles.box, { [styles.boxChecked]: isSelected })} aria-hidden="true">
                          {isSelected && <Icon icon={icons.checkmark} width={9} height={7} />}
                        </span>
                        <span className={styles.optionText}>
                          <span className={styles.optionLabel}>{item.label}</span>
                          {item.clientName && <span className={styles.optionSecondary}>{item.clientName}</span>}
                          {item.archivedStatus && (
                            <span className={styles.archivedTag}>{t('common.multi_search.archived_tag')}</span>
                          )}
                        </span>
                        {meta?.trailing !== undefined && <span className={styles.trailing}>{meta.trailing}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiSearch;
