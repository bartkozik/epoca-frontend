import Label from '@/core/theme/label';
import { ChangeEvent, forwardRef } from 'react';
import clsx from 'clsx';
import FormErrorMessage from '../FormErrorMessage';
import { TextAreaProps } from '../types';
import styles from './TextArea.module.scss';

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    className,
    error,
    infoText,
    label,
    name,
    onChange,
    rows = 1,
    secondaryLabel,
    size = 'normal',
    value,
    isLabelBold,
    readOnly,
  }: TextAreaProps,
  ref,
): JSX.Element {
  const classes = clsx(styles.input, styles.textarea, styles[`input-${size}`], { [styles.inputReadOnly]: readOnly });

  return (
    <div className={clsx(styles.root, { [styles.error]: error }, className)}>
      <Label label={label} name={name} infoText={infoText} secondaryLabel={secondaryLabel} isLabelBold={isLabelBold} />
      <textarea
        ref={ref}
        aria-invalid={error ? 'true' : 'false'}
        className={classes}
        id={name}
        name={name}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange && onChange(e)}
        rows={rows}
        value={value}
        readOnly={readOnly}
      />
      {error && <FormErrorMessage label={label} message={error.message} type={error.type} />}
    </div>
  );
});

export default TextArea;
