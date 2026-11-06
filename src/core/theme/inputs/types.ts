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
  trailing?: string;
  inactive?: boolean;
}

export interface MultiSearchProps extends Omit<BaseInputProps, 'value' | 'onChange'> {
  items: SelectOption[];
  value: string[];
  onChange: (values: string[]) => void;
  allLabel?: string;
  searchPlaceholder?: string;
  optionMeta?: Record<string, MultiSearchOptionMeta>;
  inactiveGroupLabel?: string;
  metaStatus?: ReactNode;
  onOpen?: () => void;
  emptyItemsMessage?: string;
  alignRight?: boolean;
}

export interface TextAreaProps extends BaseTextAreaProps {
  readOnly?: boolean;
  error?: FormErrorMessageProps;
  infoText?: string;
  isLabelBold?: boolean;
}
