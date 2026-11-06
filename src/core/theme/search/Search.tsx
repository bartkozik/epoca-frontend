import Icon, { icons } from '@/core/theme/icon';
import { Input } from '@/core/theme/inputs';
import {
  useDropdownKeyboardNavigation,
  useFocusOnFirstChildAfterTitle,
  useOnClickOutside,
  useScrollToHighlightedIndex,
  useSyncedState,
} from '@/core/utils/hooks';
import { ProjectStatusOption } from '@/core/utils/option-types';
import { useRef, useState } from 'react';
import clsx from 'clsx';
import FormErrorMessage from '../inputs/FormErrorMessage';
import { SelectOption, SelectProps } from '../inputs/types';
import styles from './Search.module.scss';

const Search = <T extends SelectOption | ProjectStatusOption>({
  className,
  emptyItemsMessage,
  error,
  items,
  label = '',
  multiple = false,
  name,
  noResultsMessage,
  onChange,
  onSelect,
  placeholder,
  readOnly = false,
  withCheckbox,
  value,
}: SelectProps<T>): JSX.Element => {
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentItems, setCurrentItems] = useSyncedState(items);

  const filteredItems = currentItems
    .sort((a, b) => a.label.localeCompare(b.label))
    .filter((item) => {
      const searchLower = searchQuery.toLowerCase();
      const labelLower = item.label.toLowerCase();
      const emailLower = item.email?.toLowerCase();

      const [firstName, lastName] = labelLower.split(' ');

      const combinedQuery = `${firstName[0]}${lastName}`;

      return labelLower.includes(searchLower) || emailLower?.includes(searchLower) || combinedQuery === searchLower;
    });

  const emptyStateMessage =
    currentItems.length === 0 ? emptyItemsMessage : filteredItems.length === 0 ? noResultsMessage : undefined;

  useFocusOnFirstChildAfterTitle({
    childRef: inputRef,
    wrapperRef: dropdownRef,
    parentRef: dropdownRef,
    shouldCheckParentNode: true,
  });

  const handleItemClick = (item: T): void => {
    onSelect?.(item);
    setIsMenuOpen(false);

    const updatedSearchQuery = multiple ? '' : item.label;

    if (multiple) {
      const updatedItems = currentItems.filter((ci) => ci !== item);
      setCurrentItems(updatedItems);
    }

    setSearchQuery(updatedSearchQuery);
  };

  const onOptionSelect = (item: T): void => {
    handleItemClick(item);
  };

  const { handleInputKeyDown, highlightedIndex } = useDropdownKeyboardNavigation<T>({
    showOptions: isMenuOpen,
    setShowOptions: setIsMenuOpen,
    onOptionSelect,
    searchedOptionsWithTitles: filteredItems,
    optionRefs,
  });

  useScrollToHighlightedIndex({
    highlightedIndex,
    showOptions: isMenuOpen,
    optionRefs,
  });

  useOnClickOutside({
    ref: dropdownRef,
    handler: () => setIsMenuOpen(false),
  });

  return (
    <div className={clsx(styles.root, { [styles.error]: error }, className)}>
      <label className={styles.label} htmlFor={name}>
        {label}
      </label>
      <div ref={dropdownRef} className={styles.inputContainer} onClick={() => !readOnly && setIsMenuOpen(true)}>
        <Input
          autoCompleteOff
          className={clsx(styles.input, { [styles.readOnly]: !readOnly })}
          name="search"
          type="text"
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setIsMenuOpen(true);
            onChange?.(event);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          value={value || searchQuery}
          icon={!readOnly ? <Icon icon={icons.search} width={24} height={16} /> : undefined}
          readOnly={readOnly}
          ref={inputRef}
        />
        <div className={styles.settingsDropdown}>
          {isMenuOpen && (
            <div className={clsx(styles.dropdownContent, { [styles.emptyDropdownContent]: emptyStateMessage })}>
              <div className={styles.dropdownMenu}>
                <ul className={clsx(styles.dropdownMenuList, { [styles.emptyDropdownMenuList]: emptyStateMessage })}>
                  {emptyStateMessage ? (
                    <li className={styles.emptyState}>{emptyStateMessage}</li>
                  ) : (
                    filteredItems.map((item, i) => (
                      <li
                        key={item.value}
                        ref={(el) => (optionRefs.current[i] = el)}
                        className={clsx(styles.dropdownMenuListItem, {
                          [styles.highlightedDropdownOption]: i === highlightedIndex,
                        })}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleItemClick(item);
                        }}
                      >
                        <span>{item.label}</span>
                        {withCheckbox && (
                          <label className={styles.customCheckbox}>
                            <input readOnly type="checkbox" />
                            <span className={styles.checkmark}></span>
                          </label>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
        {error && <FormErrorMessage label={label} message={error.message} type={error.type} />}
      </div>
    </div>
  );
};

export default Search;
