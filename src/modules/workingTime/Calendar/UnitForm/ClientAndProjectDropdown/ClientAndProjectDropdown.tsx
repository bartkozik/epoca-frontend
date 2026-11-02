import Icon, { icons } from '@/core/theme/icon';
import { Input } from '@/core/theme/inputs';
import stylesVariables from '@/core/theme/variables.module.scss';
import {
  useDebounce,
  useDropdownKeyboardNavigation,
  useOnClickOutside,
  useScrollToHighlightedIndex,
} from '@/core/utils/hooks';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { FormError } from '../types';
import styles from './ClientAndProjectDropdown.module.scss';
import { ClientAndProjectOption, ClientAndProjectOptionData } from './types';

interface ClientAndProjectDropdownProps {
  disabled?: boolean;
  autoCompleteOff: boolean;
  error: FormError | undefined;
  isProjectArchived: boolean;
  isUserExcludedFromProject: boolean;
  isDisplayedInReportView: boolean;
  label: string;
  name: string;
  onChange: (newValue: ClientAndProjectOption | undefined) => void;
  options: ClientAndProjectOption[];
  placeholder: string;
  value: ClientAndProjectOption | undefined;
}

const ClientAndProjectDropdown = ({
  disabled = false,
  autoCompleteOff,
  isProjectArchived,
  isUserExcludedFromProject,
  isDisplayedInReportView,
  error,
  label,
  name,
  onChange,
  options,
  placeholder,
  value,
}: ClientAndProjectDropdownProps): JSX.Element => {
  const { t } = useTranslation();
  const optionsRef = useRef(null);
  const dropdownOptionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [showOptions, setShowOptions] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchedOptionsWithTitles, setSearchedOptionsWithTitles] = useState<ClientAndProjectOption[]>(options);

  const debounceSearchText = useDebounce(searchText, 300);

  useEffect(() => {
    if (inputRef.current || !showOptions) inputRef.current?.focus();
  }, [inputRef.current, showOptions]);

  useEffect(() => {
    setShowOptions(Boolean(debounceSearchText));
  }, [debounceSearchText]);

  useEffect(() => {
    if (value && !searchedOptionsWithTitles.find((o) => o.projectId === value.projectId)) {
      onOptionSelect(value);
    }
  }, [value]);

  useEffect(() => {
    if (!debounceSearchText) setSearchedOptionsWithTitles(options);
    else {
      const filteredOptions = options.filter((option) => {
        const searchQuery = debounceSearchText.toLowerCase();
        return (
          option.clientName?.toLowerCase().includes(searchQuery) ||
          option.projectName?.toLowerCase().includes(searchQuery)
        );
      });

      if (filteredOptions.length > 0) setSearchedOptionsWithTitles(filteredOptions);
      else setSearchedOptionsWithTitles([{ title: t('common.no_results_found') }]);
    }
  }, [debounceSearchText, options]);

  const onOptionSelect = (option: ClientAndProjectOption): void => {
    if (disabled) return;
    hideOptionsAndClearSearchText();
    setShowOptions(false);
    onChange(option);
  };

  const { handleInputKeyDown, highlightedIndex } = useDropdownKeyboardNavigation({
    showOptions,
    setShowOptions,
    onOptionSelect,
    searchedOptionsWithTitles,
    optionRefs: dropdownOptionRefs,
  });

  useScrollToHighlightedIndex({
    highlightedIndex,
    showOptions,
    optionRefs: dropdownOptionRefs,
  });

  const dropdownRef = useRef<HTMLDivElement>(null);

  const hideOptionsAndClearSearchText = (): void => {
    setSearchText('');
    setShowOptions(false);
  };

  useOnClickOutside({
    ref: dropdownRef,
    handler: hideOptionsAndClearSearchText,
  });

  const isProjectArchivedAndNotInReportView = !(
    (isProjectArchived || isUserExcludedFromProject) &&
    !isDisplayedInReportView
  );

  const startSearchingOptions = (): void => {
    if (disabled) return;
    setShowOptions(isProjectArchivedAndNotInReportView);
  };

  const clearSearchText = (): void => {
    setSearchText('');
  };

  const extractValuesFromOption = (option: ClientAndProjectOption): ClientAndProjectOptionData | null => {
    const { clientName, projectName, clientColor, title } = option;
    const colorBallBackground = { backgroundColor: clientColor ?? stylesVariables.colorSuccess };

    if (!clientName || !projectName) return null;

    return { projectName, clientName, colorBallBackground, title };
  };

  const displayOptionalProjectInfo = (): JSX.Element | null => {
    const optionalInfo = isDisplayedInReportView
      ? `. ${t(
          'working_time.calendar.unit_form.client_and_project_dropdown.optional_information.editing_allowed_assigning_disabled',
        )}`
      : `: ${t('working_time.calendar.unit_form.client_and_project_dropdown.optional_information.switching_disabled')}`;

    if (isProjectArchived && isUserExcludedFromProject)
      return (
        <p>
          {t(
            'working_time.calendar.unit_form.client_and_project_dropdown.statuses.project_archived_user_not_a_member',
            {
              optionalInfo,
            },
          )}
        </p>
      );
    else if (isProjectArchived)
      return (
        <p>
          {t('working_time.calendar.unit_form.client_and_project_dropdown.statuses.project_archived', { optionalInfo })}
        </p>
      );
    else if (isUserExcludedFromProject)
      return (
        <p>
          {t('working_time.calendar.unit_form.client_and_project_dropdown.statuses.user_removed', { optionalInfo })}
        </p>
      );

    return null;
  };

  const renderDropdownOptions = (): JSX.Element | null => {
    if (value && !showOptions) {
      const extractedValues = extractValuesFromOption(value);

      if (!extractedValues) return null;

      const { colorBallBackground, clientName, projectName } = extractedValues;

      return (
        <div
          className={clsx(styles.selectedOptionArea, {
            [styles.selectedOptionNotDisabled]: isProjectArchivedAndNotInReportView,
          })}
        >
          <label className={styles.label} htmlFor={name}>
            {label}
            {displayOptionalProjectInfo()}
          </label>
          <div
            className={styles.selectedOption}
            onClick={startSearchingOptions}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={label}
            aria-disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                startSearchingOptions();
              }
            }}
          >
            <div className={styles.firstLine}>
              <div className={styles.dot} style={colorBallBackground} />
              <div className={styles.text}>{clientName}</div>
            </div>
            <div className={styles.secondLine}>{projectName}</div>
          </div>
        </div>
      );
    } else
      return (
        <Input
          autoCompleteOff={autoCompleteOff}
          autofocusOn
          className={clsx(styles.formInput)}
          inputFieldClassName={clsx({ [styles.inputWithSelectedValue]: value })}
          error={error}
          label={label}
          name={name}
          onChange={(e) => setSearchText(e.target.value)}
          onClick={() => !disabled && setShowOptions(true)}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          readOnly={disabled || isProjectArchived}
          type="text"
          value={searchText}
          icon={
            searchText ? (
              <Icon className={styles.clear} icon={icons.x} width={12} height={12} onClick={clearSearchText} />
            ) : undefined
          }
        />
      );
  };

  const renderDropdownOptionsList = (option: ClientAndProjectOption, i: number): JSX.Element | null => {
    const extractedValues = extractValuesFromOption(option);

    if (!extractedValues) return <div className={styles.noDataTitle}> {t('common.no_data_found')}</div>;

    if (extractedValues.title) {
      return (
        <div key={i + extractedValues.title} className={styles.optionTitle}>
          {extractedValues.title}
        </div>
      );
    } else {
      return (
        <div
          key={i}
          ref={(el) => (dropdownOptionRefs.current[i] = el)}
          className={clsx(styles.option, {
            [styles.highlightedDropdownOption]: i === highlightedIndex,
          })}
          onClick={() => onOptionSelect(option)}
        >
          <div className={styles.firstLineDropOption}>
            <div className={styles.dot} style={extractedValues.colorBallBackground} />
            <div className={styles.textDropOption}>{extractedValues.clientName}</div>
          </div>
          <div className={styles.secondLineDropOption}>{extractedValues.projectName}</div>
        </div>
      );
    }
  };

  return (
    <div ref={dropdownRef} className={styles.clientAndProjectDropdown}>
      <div>{renderDropdownOptions()}</div>
      <div
        className={clsx(
          styles.optionsArea,
          { [styles.showOptions]: showOptions && !disabled },
          { [styles.isValueSelected]: value },
        )}
      >
        <div className={styles.options}>
          <div className={styles.optionsInner}>
            <div ref={optionsRef} className={styles.optionsList}>
              <div className={styles.optionsListResults}>
                {searchedOptionsWithTitles.length === 0 && (
                  <span className={clsx(styles.option, styles.dropdownLabel)}>
                    {t('working_time.calendar.unit_form.client_and_project_dropdown.statuses.no_assignments')}
                  </span>
                )}
                {searchedOptionsWithTitles.map(renderDropdownOptionsList)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientAndProjectDropdown;
