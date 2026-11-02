import Spinner from '@/core/theme/spinner';
import { useTitle } from '@/core/utils/hooks';
import { useTranslation } from 'react-i18next';
import { useSamlLoginCallback } from '../hooks/useSamlLoginCallback';
import styles from './SsoLoginCallback.module.scss';

const SSOLoginCallback = (): JSX.Element => {
  const { t } = useTranslation();
  const { isPending } = useSamlLoginCallback();
  useTitle(t('sso_auth.sso_login_callback.title'));

  return (
    <div className={styles.root}>
      <Spinner loading={isPending} />
    </div>
  );
};

export default SSOLoginCallback;
