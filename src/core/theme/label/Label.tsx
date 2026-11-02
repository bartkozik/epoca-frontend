import InfoIcon from '@/core/theme/infoIcon';
import clsx from 'clsx';
import styles from './Label.module.scss';

interface LabelProps {
  label: string;
  name?: string;
  className?: string;
  infoText?: string;
  secondaryLabel?: string;
  isLabelBold?: boolean;
}

const Label = ({ label, name, className, infoText, secondaryLabel, isLabelBold }: LabelProps): JSX.Element => {
  const regularLabel = (
    <>
      <label
        className={clsx(
          styles.label,
          { [styles.labelBottomMargin]: !infoText },
          { [styles.labelBold]: isLabelBold },
          !infoText && className,
        )}
        htmlFor={name}
      >
        {label}
      </label>
      {secondaryLabel && <span className={styles.secondaryLabel}>{secondaryLabel}</span>}
    </>
  );

  const labelWithImportantIcon = (
    <div className={clsx({ [styles.labelHeader]: infoText }, className)}>
      {regularLabel}
      {infoText && <InfoIcon tooltipText={infoText} />}
    </div>
  );

  const labelDisplayed = infoText ? labelWithImportantIcon : regularLabel;

  return <>{labelDisplayed}</>;
};

export default Label;
