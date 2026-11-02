import logo from '@/core/theme/assets/svg/new-logo.svg';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import styles from './LogoImage.module.scss';

interface LogoImageProps {
  className?: string;
  to: string;
}

const LogoImage = ({ className, to }: LogoImageProps): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleClick = (): void => {
    navigate(to);
  };

  return (
    <img
      alt={t('common.epoca_logo_alt')}
      className={clsx(styles.logoImage, className)}
      onClick={handleClick}
      src={logo}
    />
  );
};

export default LogoImage;
