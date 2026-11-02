import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import InfoIcon from '@/core/theme/infoIcon';
import {
  KeyBoardEventType,
  useDropdownKeyboardNavigation,
  useKeyDown,
  useOnClickOutside,
  useScrollToHighlightedIndex,
} from '@/core/utils/hooks';
import { CLIENT_COLORS, CLIENT_TEXTURES } from '@/modules/clients/clientBackgroundOptions';
import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import styles from './BackgroundPicker.module.scss';
import { BackgroundType } from './BackgroundType';

interface BackgroundPickerProps {
  className?: string;
  dataTestId?: string;
  infoText?: string;
  isDropdownMobileToLeft?: boolean;
  label?: string;
  onBackgroundChange: (background: string) => void;
  readOnly?: boolean;
  selectedBackground: string;
  type: BackgroundType;
  whiteBackground?: boolean;
}

const BackgroundPicker = ({
  className,
  dataTestId,
  infoText,
  isDropdownMobileToLeft = false,
  label,
  onBackgroundChange,
  readOnly = false,
  selectedBackground,
  type,
  whiteBackground = false,
}: BackgroundPickerProps): JSX.Element => {
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [isOpen, setIsOpen] = useState(false);

  useOnClickOutside({
    ref: dropdownRef,
    handler: () => setIsOpen(false),
  });

  const handleOnClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    setIsOpen(!isOpen);
  };

  const selectBackground = (item: string): void => {
    onBackgroundChange(item);
    setIsOpen(!isOpen);
  };

  const closeOpenOptionsList = (): void => {
    isOpen && setIsOpen(false);
  };

  useKeyDown({
    keyboardEventType: KeyBoardEventType.TAB,
    action: closeOpenOptionsList,
    isListening: true,
  });

  const backgroundOutput =
    type === BackgroundType.Color
      ? { backgroundColor: selectedBackground }
      : { backgroundImage: `url(${selectedBackground})` };
  const dropdownClass = type === BackgroundType.Color ? styles.dropdownColorItems : styles.dropdownTextureItems;
  const dropdownOptionClass = type === BackgroundType.Color ? styles.colorOption : styles.textureOption;

  const options = type === BackgroundType.Color ? CLIENT_COLORS : CLIENT_TEXTURES;

  const { handleInputKeyDown, highlightedIndex } = useDropdownKeyboardNavigation({
    showOptions: isOpen,
    setShowOptions: setIsOpen,
    onOptionSelect: selectBackground,
    searchedOptionsWithTitles: options,
    optionRefs,
  });

  useScrollToHighlightedIndex({
    highlightedIndex,
    showOptions: isOpen,
    optionRefs,
  });

  return (
    <div className={clsx(styles.root, className)} onKeyDown={handleInputKeyDown}>
      <div className={styles.labelBox}>
        <span className={styles.label}>{label}</span>
        {infoText && <InfoIcon iconClassName={styles.infoIcon} tooltipText={infoText} />}
      </div>
      <div ref={dropdownRef} className={styles.relativeContainer}>
        <span className={styles.selectedBackground} data-testid={dataTestId} style={backgroundOutput} />
        <IconButton
          color="gray"
          disabled={readOnly}
          iconStyles={styles.dropdownBtn}
          icon={<Icon icon={icons.arrowDown} className={clsx({ [styles.arrow]: isOpen })} width={12} height={7} />}
          onClick={handleOnClick}
          size="large"
          variant="outlined"
        />
        {isOpen && (
          <div
            className={clsx(
              styles.dropdown,
              { [styles.dropdownToLeft]: isDropdownMobileToLeft },
              { [styles.dropdownBgWhite]: whiteBackground },
            )}
          >
            <div className={dropdownClass}>
              {options.map((o, i) => {
                const dropdownItemStyle = type === BackgroundType.Color ? { backgroundColor: o } : undefined;

                return (
                  <div
                    key={o}
                    className={clsx(dropdownOptionClass, {
                      [styles.selected]: o === selectedBackground,
                      [styles.highlightedDropdownOption]: i === highlightedIndex,
                    })}
                    style={dropdownItemStyle}
                    onClick={() => selectBackground(o)}
                    ref={(el) => (optionRefs.current[i] = el)}
                  >
                    {o === selectedBackground && <Icon icon={icons.checkmark} width={10} height={8} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BackgroundPicker;
