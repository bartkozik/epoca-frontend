import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import styles from './GoBack.module.scss';

interface GoBackProps {
  href: string;
  label: string;
}

const GoBack = ({ href, label }: GoBackProps): JSX.Element => {
  return (
    <header className={styles.root}>
      <Button
        color="fontHeading"
        href={href}
        label={label}
        size="extraSmall"
        startIcon={<Icon icon={icons.arrowBack} width={15} height={13} />}
        variant="text"
      />
    </header>
  );
};

export default GoBack;
