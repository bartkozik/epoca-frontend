import Icon, { icons } from '@/core/theme/icon';
import { Input } from '@/core/theme/inputs';
import Label from '@/core/theme/label';
import Spinner from '@/core/theme/spinner';
import { useDropdownKeyboardNavigation, useOnClickOutside, useScrollToHighlightedIndex } from '@/core/utils/hooks';
import { ProjectStatusOption } from '@/core/utils/option-types';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import FormErrorMessage from '../inputs/FormErrorMessage';
import { SelectOption, SelectProps } from '../inputs/types';
import styles from './Select.module.scss';

const Select = <T extends SelectOption | ProjectStatusOption>({
  className,
  dropdownPosition = 'bottom',
  error,
  items,
  label = '',
  loading = false,
  name,
  infoText,
  onSelect,
  onValueChange,
  placeholder,
  readOnly = false,
  selectedItem,
  size = 'small',
  isMaxWidth = false,
  isLabelBold,
}: SelectProps<T>): JSX.Element => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const id = useId();
  const inputId = name || `${id}-input`;
  const listboxId = `${id}-listbox`;
  const interactive = !loading && !readOnly;
  const menuOpen = isMenuOpen && interactive;

  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const toggleMenu = (): void => {
    if (!loading && !readOnly) setIsMenuOpen(!isMenuOpen);
  };

  const handleClickOutside = useCallback(() => {
    if (isMenuOpen) setIsMenuOpen(false);
  }, [isMenuOpen]);

  useOnClickOutside({
    ref: dropdownRef,
    handler: handleClickOutside,
  });

  const handleOnSelect = (item: T): void => {
    if (!interactive) return;
    if (onSelect) onSelect(item);
    if (onValueChange) onValueChange(item);
    setIsMenuOpen(false);
  };

  const menuIconDisplay = !readOnly ? (
    <Icon className={clsx({ [styles.arrow]: menuOpen })} icon={icons.arrowDown} width={12} height={7} />
  ) : (
    <></>
  );

  const { handleInputKeyDown, highlightedIndex, resetHighlightedIndex } = useDropdownKeyboardNavigation<T>({
    showOptions: menuOpen,
    setShowOptions: setIsMenuOpen,
    onOptionSelect: handleOnSelect,
    searchedOptionsWithTitles: items,
    optionRefs,
    nativeTab: true,
  });

  useScrollToHighlightedIndex({
    highlightedIndex,
    showOptions: menuOpen,
    optionRefs,
  });

  useEffect(() => {
    if (!interactive) {
      setIsMenuOpen(false);
      resetHighlightedIndex();
    }
  }, [interactive, resetHighlightedIndex]);

  return (
    <div ref={dropdownRef} className={clsx({ [styles.error]: error }, { [styles.maxWidth]: isMaxWidth }, className)}>
      {label && <Label label={label} name={inputId} infoText={infoText} isLabelBold={isLabelBold} />}
      <div className={styles.inputContainer} onClick={toggleMenu}>
        <Input
          className={clsx(styles.input, { [styles.readOnly]: !readOnly })}
          name={inputId}
          role="combobox"
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          aria-controls={menuOpen ? listboxId : undefined}
          aria-activedescendant={
            menuOpen && highlightedIndex >= 0 && highlightedIndex < items.length
              ? `${listboxId}-option-${highlightedIndex}`
              : undefined
          }
          aria-disabled={!interactive}
          size={size}
          type="text"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && menuOpen) {
              event.preventDefault();
              event.stopPropagation();
              setIsMenuOpen(false);
              resetHighlightedIndex();
              return;
            }
            const selectionKey = ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key);
            if (!interactive || (items.length === 0 && selectionKey)) {
              if (selectionKey) event.preventDefault();
              return;
            }
            handleInputKeyDown(event);
          }}
          placeholder={placeholder}
          value={selectedItem?.label}
          icon={menuIconDisplay}
          readOnly
        />
        {loading && <Spinner className={styles.spinner} loading={loading} small />}
        {menuOpen && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={label || placeholder || name}
            className={clsx(styles.dropdownMenu, styles[`dropdownMenu-${dropdownPosition}`])}
          >
            {items.map((item, i) => (
              <li
                key={i}
                id={`${listboxId}-option-${i}`}
                role="option"
                aria-selected={selectedItem?.value === item.value}
                className={clsx(styles.dropdownMenuItem, {
                  [styles.highlightedDropdownOption]: i === highlightedIndex,
                })}
                ref={(el) => (optionRefs.current[i] = el)}
                onClick={() => handleOnSelect(item)}
              >
                {item.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <FormErrorMessage label={label} message={error.message} type={error.type} />}
    </div>
  );
};

export default Select;
