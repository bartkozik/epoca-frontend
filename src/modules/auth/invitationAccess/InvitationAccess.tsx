import Button from '@/core/theme/button';
import { Input } from '@/core/theme/inputs';
import { sessionIdentityKey } from '@/core/utils/helpers/session-identity';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { authPaths } from '../routes';
import { useInvitationAccess } from './hooks/useInvitationAccess';
import styles from './InvitationAccess.module.scss';

const InvitationAccessContent = (): JSX.Element => {
  const { t } = useTranslation();
  const {
    summary,
    error,
    busy,
    cooldown,
    draft,
    validationError,
    canStartSso,
    signIn,
    updateDraft,
    readSummary,
    submit,
    startSso,
  } = useInvitationAccess();

  return (
    <section className={styles.root} aria-busy={busy}>
      <h1>{t('auth.invitation.title')}</h1>
      {busy && <p role="status">{t('auth.invitation.loading')}</p>}
      {error && <p role="alert">{t(`auth.invitation.errors.${error.code}`)}</p>}
      {summary && (
        <>
          <dl className={styles.details}>
            <dt>{t('auth.invitation.organization')}</dt>
            <dd>{summary.organization.name}</dd>
            <dt>{t('auth.invitation.email')}</dt>
            <dd>{summary.email}</dd>
            <dt>{t('auth.invitation.roles')}</dt>
            <dd>{summary.roles.join(', ')}</dd>
          </dl>
          <p>{t(`auth.invitation.actions.${summary.nextAction}`)}</p>
          {canStartSso && (
            <Button
              dataTestId="invitationSso"
              type="button"
              disabled={busy || cooldown > 0}
              label={t('auth.invitation.sso')}
              onClick={() => void startSso()}
            />
          )}
          {(summary.nextAction === 'CreateAccount' || summary.nextAction === 'Accept') && (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {summary.nextAction === 'CreateAccount' && (
                <>
                  <p id="invitation-password-policy">{t('auth.invitation.password_policy')}</p>
                  <Input
                    name="password"
                    dataTestId="invitationPassword"
                    label={t('common.password')}
                    type="password"
                    autoComplete="new-password"
                    value={draft.password}
                    onChange={(event) => updateDraft('password', event.target.value)}
                  />
                  <Input
                    name="confirmation"
                    dataTestId="invitationConfirmation"
                    label={t('auth.invitation.confirmation')}
                    type="password"
                    autoComplete="new-password"
                    value={draft.confirmation}
                    onChange={(event) => updateDraft('confirmation', event.target.value)}
                  />
                  {validationError && <p role="alert">{t('auth.invitation.password_confirmation_error')}</p>}
                </>
              )}
              <Button
                dataTestId="invitationSubmit"
                type="submit"
                disabled={busy || cooldown > 0}
                label={t(
                  error?.code === 'revision-conflict' ? 'auth.invitation.review_accept' : 'auth.invitation.accept',
                )}
              />
            </form>
          )}
        </>
      )}
      {signIn && (
        <Link
          to={
            error?.code === 'session-issue-failed'
              ? `${authPaths.invitationSignIn}?joined=1`
              : authPaths.invitationSignIn
          }
        >
          {t('common.login')}
        </Link>
      )}
      {error && ['unavailable', 'rate-limited'].includes(error.code) && (
        <Button disabled={busy || cooldown > 0} label={t('auth.invitation.retry')} onClick={() => void readSummary()} />
      )}
      {cooldown > 0 && <p role="status">{t('auth.invitation.cooldown', { seconds: cooldown })}</p>}
    </section>
  );
};

const InvitationAccess = (): JSX.Element => {
  const auth = useAuth();
  const workspace = useWorkspace();

  return <InvitationAccessContent key={sessionIdentityKey(auth.loggedInUser?.id, workspace.contextOrganizationSlug)} />;
};

export default InvitationAccess;
