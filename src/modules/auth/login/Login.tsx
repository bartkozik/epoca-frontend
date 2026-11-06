import { paths } from '@/app/routing/paths';
import { useToast } from '@/core/providers/toastProvider';
import Button from '@/core/theme/button';
import Icon from '@/core/theme/icon/Icon';
import { icons } from '@/core/theme/icon/icons';
import { Input } from '@/core/theme/inputs';
import LoadingArea from '@/core/theme/loadingArea';
import { handleValidationErrors, parseUrlErrorParams } from '@/core/utils/helpers';
import { useInitializeLanguage, useTitle } from '@/core/utils/hooks';
import { useAuth } from '@/modules/auth/AuthProvider';
import { LoginErrors } from '@/modules/auth/types';
import { classifySamlAuthCheckFailure, useSamlAuthCheckQuery } from '@/modules/ssoAuth';
import { setSsoInvitationReturn } from '@/modules/ssoAuth/invitationReturn';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { LoginSchema } from '../models/login.model';
import { authPaths } from '../routes';
import styles from './Login.module.scss';

type LoginProps = { invitationReturn?: boolean };

const Login = ({ invitationReturn = false }: LoginProps): JSX.Element => {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { isAuthenticated, login, loading, userChosenLanguage } = auth;
  const samlAuthCheckQuery = useSamlAuthCheckQuery();
  const ssoSectionHidden = loading;
  const { samlRequest = '', ssoUrl = '' } = samlAuthCheckQuery.data ?? {};
  const isSamlAuthChecked = !ssoSectionHidden && !samlAuthCheckQuery.isError && Boolean(samlRequest && ssoUrl);
  const isSamlAuthCheckPaused = samlAuthCheckQuery.isPending && samlAuthCheckQuery.isPaused;
  const samlAuthCheckErrorKey = ssoSectionHidden
    ? null
    : samlAuthCheckQuery.isError
      ? classifySamlAuthCheckFailure(samlAuthCheckQuery.error).kind === 'temporary'
        ? 'auth.login.text.sso_temporarily_unavailable'
        : 'auth.login.text.sso_unavailable'
      : isSamlAuthCheckPaused
        ? 'auth.login.text.sso_offline'
        : null;
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loginFormErrors, setLoginFormErrors] = useState<LoginErrors>({});
  const [formKey, setFormKey] = useState(Date.now());

  useTitle(t('common.login'));
  useInitializeLanguage(userChosenLanguage);

  useEffect(() => {
    if (!isAuthenticated) {
      setFormKey(Date.now());
      setLoginData({ email: '', password: '' });
      setIsPasswordVisible(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const { errorCode, reason } = parseUrlErrorParams();

    if (errorCode) {
      let toastMessage = '';

      switch (errorCode) {
        case '404':
          toastMessage = t('toast_message.saml.missing_info');
          break;
        case '403':
          toastMessage = t('toast_message.saml.new_user_create_error');
          break;
        default:
          toastMessage = t('toast_message.saml.default_error');
          break;
      }

      addToast({
        content: toastMessage,
        type: 'error',
        correlationId: reason && !['unknown', 'missing_token_or_slug'].includes(reason) ? reason : undefined,
      });

      const url = new URL(window.location.href);
      url.searchParams.delete('errorCode');
      url.searchParams.delete('reason');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [addToast, t]);

  const handleInputFieldChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: string): void => {
    setLoginData({ ...loginData, [fieldName]: e.target.value });
    setLoginFormErrors({
      ...loginFormErrors,
      [fieldName]: undefined,
    });
  };

  const handleLogin = (e: FormEvent): void => {
    e.preventDefault();
    const validationResult = LoginSchema.safeParse(loginData);
    if (validationResult.success) {
      const { email, password } = validationResult.data;
      void login(email, password)
        .then(() => navigate(invitationReturn ? authPaths.invitationAccept : paths.index))
        .catch(() => undefined);
    } else {
      const validationErrors = handleValidationErrors(validationResult.error);

      setLoginFormErrors(validationErrors);
    }
  };

  const isSubmitBtnDisabled = useMemo(() => !loginData.email || !loginData.password, [loginData]);

  return (
    <div className={styles.root}>
      <h1 className={styles.welcomeSign}>{t('auth.login.title.welcome_to_epoca')}</h1>

      <form key={formKey} className={styles.loginForm} onSubmit={handleLogin}>
        <div className={styles.inputs}>
          <Input
            autofocusOn
            error={loginFormErrors.email}
            className={styles.input}
            dataTestId="loginEmailInput"
            label={t('auth.login.input.email.label')}
            name="email"
            onChange={(e) => handleInputFieldChange(e, 'email')}
            size="large"
            type="text"
            value={loginData.email}
          />
          <Input
            autoComplete="current-password"
            error={loginFormErrors.password}
            className={styles.input}
            dataTestId="loginPasswordInput"
            endAdornment={
              <button
                aria-label={t(isPasswordVisible ? 'auth.login.password.hide' : 'auth.login.password.show')}
                aria-pressed={isPasswordVisible}
                className={styles.passwordVisibilityButton}
                data-testid="loginPasswordVisibilityButton"
                onBlur={(e) => {
                  if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
                    setIsPasswordVisible(false);
                  }
                }}
                onClick={(e) => {
                  // WebKit does not focus clicked buttons, so explicit focus is needed for onBlur.
                  e.currentTarget.focus();
                  setIsPasswordVisible((visible) => !visible);
                }}
                type="button"
              >
                <span aria-hidden="true">
                  <Icon
                    className={styles.passwordVisibilityIcon}
                    icon={icons[isPasswordVisible ? 'visibilityOn' : 'visibilityOff']}
                    width={20}
                    height={20}
                  />
                </span>
              </button>
            }
            label={t('common.password')}
            name="password"
            onChange={(e) => handleInputFieldChange(e, 'password')}
            size="large"
            inputFieldClassName={styles.passwordInput}
            onBlur={(e) => {
              if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
                setIsPasswordVisible(false);
              }
            }}
            type={isPasswordVisible ? 'text' : 'password'}
            value={loginData.password}
          />
        </div>
        <Button
          maxWidth
          dataTestId="loginButton"
          className={styles.button}
          disabled={isSubmitBtnDisabled}
          label={t('common.login')}
          loading={loading}
          size="large"
          type="submit"
          variant="contained"
        />

        {




}
      </form>

      <LoadingArea className={styles.ssoSection} loading={samlAuthCheckQuery.isLoading}>
        {isSamlAuthChecked && (
          <div className={clsx(styles.ssoLogin, styles.loginForm)}>
            <span className={styles.ssoTitle}>{t('auth.login.text.or_sign_in_with')}</span>
            <form className={styles.ssoForm} action={ssoUrl} onSubmit={() => setSsoInvitationReturn(invitationReturn)}>
              <input type="hidden" name="SAMLRequest" value={samlRequest} />
              <Button
                dataTestId="workspaceLoginButton"
                label={t('auth.login.button.your_workspace.label')}
                type="submit"
                variant="contained"
                size="large"
                maxWidth
              />
            </form>
          </div>
        )}

        {samlAuthCheckErrorKey && (
          <div className={clsx(styles.ssoLogin, styles.loginForm)}>
            <span className={styles.ssoUnavailableText} data-testid="ssoUnavailableText">
              {t(samlAuthCheckErrorKey)}
            </span>
          </div>
        )}
      </LoadingArea>
    </div>
  );
};

export default Login;
