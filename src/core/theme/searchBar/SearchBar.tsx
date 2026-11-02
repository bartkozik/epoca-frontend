import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import { Input } from '@/core/theme/inputs';
import FormErrorMessage from '@/core/theme/inputs/FormErrorMessage';
import Select from '@/core/theme/select';
import { ClientFilterTypeOption, ClientStatusOption, ProjectStatusOption } from '@/core/utils/option-types';
import { ChangeEventHandler, MouseEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './SearchBar.module.scss';

export interface SearchBarProps<T extends ProjectStatusOption | ClientStatusOption, U extends ClientFilterTypeOption> {
  buttonLabel: string;
  className?: string;
  handleInputChange?: ChangeEventHandler<HTMLInputElement>;
  handleInputReset: MouseEventHandler;
  handleStatusSelect: (option: T) => void;
  handleTypeSelect?: (option: U) => void;
  isAddBtnHidden?: boolean;
  isNoSearchItem: boolean | string;
  isResetBtnVisible: boolean;
  openNewItemForm?: MouseEventHandler<HTMLButtonElement>;
  placeholder?: string;
  query?: string;
  selectedStatusOption?: T;
  selectedTypeOption?: U;
  selectStatusItems: T[];
  selectTypeItems?: U[];
  withSearchInput?: boolean;
  withTypeSelect?: boolean;
}

const SearchBar = <T extends ProjectStatusOption | ClientStatusOption, U extends ClientFilterTypeOption>({
  buttonLabel,
  className,
  handleInputChange,
  handleInputReset,
  handleStatusSelect,
  handleTypeSelect,
  isAddBtnHidden = false,
  isNoSearchItem,
  isResetBtnVisible,
  openNewItemForm,
  placeholder,
  query,
  selectedStatusOption,
  selectedTypeOption,
  selectStatusItems,
  selectTypeItems,
  withSearchInput,
  withTypeSelect,
}: SearchBarProps<T, U>): JSX.Element => {
  const { t } = useTranslation();

  const mobileErrorMessageDisplay = (): string => {
    if (withTypeSelect) return isAddBtnHidden ? styles.mobileErrorMessageAddButtonHidden : styles.mobileErrorMessage;
    else return styles.mobileErrorMessage;
  };

  const mobileResetButtonDisplay = (): string => {
    if (withTypeSelect) return isAddBtnHidden ? styles.mobileResetButtonAddButtonHidden : styles.mobileResetButton;
    else return '';
  };

  return (
    <div className={clsx(styles.root, className)}>
      <div className={clsx(styles.inputsContainer, { [styles.mobileInputsContainer]: withTypeSelect })}>
        {isResetBtnVisible && (
          <Button
            onClick={handleInputReset}
            className={clsx(styles.inputResetButton, mobileResetButtonDisplay())}
            label={t('common.reset')}
            variant="text"
            endIcon={<Icon icon={icons.x} />}
          />
        )}
        <Select
          transparent
          className={styles.statusInput}
          items={selectStatusItems}
          name="status"
          onSelect={handleStatusSelect}
          selectedItem={selectedStatusOption}
          size="small"
          isMaxWidth
        />
        {withTypeSelect && selectTypeItems && (
          <Select
            transparent
            className={styles.statusInput}
            items={selectTypeItems}
            name="type"
            onSelect={handleTypeSelect}
            selectedItem={selectedTypeOption}
            size="small"
            isMaxWidth
          />
        )}
        {withSearchInput && (
          <Input
            transparent
            className={clsx(styles.searchInput, { [styles.mobileSearchInput]: withTypeSelect })}
            name="Search"
            onChange={handleInputChange}
            placeholder={placeholder || t('common.search_by_name')}
            size="small"
            type="text"
            value={query}
            icon={<Icon icon={icons.search} width={24} height={16} />}
          />
        )}
        <Button hidden={isAddBtnHidden} label={buttonLabel} onClick={openNewItemForm} variant="contained" maxWidth />
      </div>
      {isNoSearchItem && (
        <FormErrorMessage
          className={clsx(styles.formErrorMessage, mobileErrorMessageDisplay())}
          iconPosition="left"
          message={t('common.no_elements_found')}
        />
      )}
    </div>
  );
};

export default SearchBar;
