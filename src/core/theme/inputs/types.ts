import {
  ClientFilterType,
  ClientStatus,
  ClientType,
  OrganizationUserRole,
  ProjectStatus,
  ProjectUserRole,
} from '@/core/models/enums';
import { Language } from '@/core/models/types';
import { ChangeEvent, FocusEvent, InputHTMLAttributes, ReactNode, Ref } from 'react';
import { FormErrorMessageProps } from './FormErrorMessage/FormErrorMessage';

export type InputType = 'text' | 'password' | 'email' | 'number' | 'tel' | 'date';

export interface BaseInputProps {
  autoComplete?: string;
  autoCompleteOff?: boolean;
  autofocusOn?: boolean;
  className?: string;
  color?: string;
  helperText?: string;
  icon?: JSX.Element;
  infoText?: string;
  label?: string;
  labelWarning?: string;
  link?: {
    path: string;
    text: string;
  };
  name: string;
  onBlur?: (value: FocusEvent<HTMLInputElement, Element>) => void;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onClick?: (value) => void;
  onKeyDown?: (value: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  readOnly?: boolean;
  secondaryLabel?: string;
  size?: 'small' | 'normal' | 'large';
  transparent?: boolean;
  type?: InputType;
  value?: string;
  isLabelBold?: boolean;
  shouldDisplayLinkCreator?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export interface BaseTextAreaProps {
  className?: string;
  label: string;
  name: string;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  secondaryLabel?: string;
  size?: 'small' | 'normal' | 'large';
  value?: string;
}

export interface CustomSelectOption<
  T extends
    ProjectStatus | ProjectUserRole | ClientStatus | ClientType | ClientFilterType | Language | OrganizationUserRole,
> {
  label: string;
  value: T;
  email?: string;
}

export interface InputProps
  extends
    BaseInputProps,
    Pick<
      InputHTMLAttributes<HTMLInputElement>,
      'role' | 'aria-expanded' | 'aria-controls' | 'aria-activedescendant' | 'aria-haspopup' | 'aria-disabled'
    > {
  error?: FormErrorMessageProps;
  endAdornment?: ReactNode;
  inputWrapperRef?: Ref<HTMLDivElement> | null;
  inputFieldClassName?: string;
  dataTestId?: string;
}

export interface SelectOption {
  label: string;
  value: string;
  archivedStatus?: boolean;
  email?: string;
  clientName?: string;
}

export interface SelectProps<T> extends BaseInputProps {
  dropdownPosition?: 'top' | 'bottom';
  emptyItemsMessage?: string;
  error?: FormErrorMessageProps;
  items: T[];
  multiple?: boolean;
  onValueChange?: (value: T) => void;
  onSelect?: ((status: T) => void) | undefined;
  noResultsMessage?: string;
  readOnly?: boolean;
  selectedItem?: T;
  withCheckbox?: boolean;
  size?: 'small' | 'normal';
  isMaxWidth?: boolean;
  loading?: boolean;
}

export interface MultiSearchOptionMeta {
  /** Right-aligned value shown in the option row, e.g. hours in the current context. */
  trailing?: string;
  /** The option has no data in the current context; it is listed in a muted group but stays selectable. */
  inactive?: boolean;
}

export interface MultiSearchProps extends Omit<BaseInputProps, 'value' | 'onChange'> {
  items: SelectOption[];
  /** Selected option values (controlled). */
  value: string[];
  /** Called only on user interaction, with the full new selection. */
  onChange: (values: string[]) => void;
  /** Closed-field text when nothing is selected, e.g. "All users". */
  allLabel?: string;
  /** Search box placeholder while the list is open. */
  searchPlaceholder?: string;
  optionMeta?: Record<string, MultiSearchOptionMeta>;
  /** Heading of the muted group for options marked `inactive`. */
  inactiveGroupLabel?: string;
  /** Status line shown above the options, e.g. when per-option values could not be loaded. */
  metaStatus?: ReactNode;
  /** Called every time the list opens; use it to load per-option values lazily. */
  onOpen?: () => void;
  emptyItemsMessage?: string;
  /** Aligns the list with the field's right edge (for fields at the right edge of a row). */
  alignRight?: boolean;
}

export interface TextAreaProps extends BaseTextAreaProps {
  readOnly?: boolean;
  error?: FormErrorMessageProps;
  infoText?: string;
  isLabelBold?: boolean;
}
