import { paths } from '@/app/routing/paths';
import Button from '@/core/theme/button';
import { Input } from '@/core/theme/inputs';
import { useInitializeLanguage } from '@/core/utils/hooks';
import { useAuth } from '@/modules/auth/AuthProvider';
import { LoginErrors } from '@/modules/auth/types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from './PasswordNew.module.scss';

function PasswordNew(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { login: authLogin, userChosenLanguage } = auth;
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [loginFormErrors, setLoginFormErrors] = useState<LoginErrors>({});

  useInitializeLanguage(userChosenLanguage);

  const login = (): void => {
    void authLogin(loginData.email, loginData.password)
      .then(() => {
        navigate(paths.index);
      })
      .catch(() => undefined);
  };

  const handleInputFieldChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: string): void => {
    setLoginData({ ...loginData, [fieldName]: e.target.value });
    setLoginFormErrors({
      ...loginFormErrors,
      [fieldName]: undefined,
    });
  };

  return (
    <div className={styles.root}>
      <div>{t('common.password_new_unavailable')}</div>
      <div className={styles.inputs}>
        <Input
          autofocusOn
          error={loginFormErrors.email}
          className={styles.input}
          label={t('auth.login.input.email.label')}
          name="email"
          onChange={(e) => handleInputFieldChange(e, 'email')}
          size="large"
          type="text"
          value={loginData.email}
        />
        <Input
          error={loginFormErrors.password}
          className={styles.input}
          label={t('common.password')}
          name="password"
          onChange={(e) => handleInputFieldChange(e, 'password')}
          size="large"
          type="password"
          value={loginData.password}
        />
      </div>
      <Button
        maxWidth
        className={styles.button}
        label={t('common.login')}
        size="large"
        onClick={login}
        variant="contained"
      />
    </div>
  );
}

export default PasswordNew;
