import { paths } from '@/app/routing/paths';
import { readStoredSession } from '@/core/api';
import { useCooldown } from '@/core/utils/hooks/useCooldown';
import { useAuth } from '@/modules/auth/AuthProvider';
import { getContextOrganizationSlugFromLS } from '@/modules/organizations/utils';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { setSsoInvitationReturn } from '@/modules/ssoAuth/invitationReturn';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InvitationPasswordSchema, type InvitationSummary } from '../../models/invitationAccess.model';
import { authPaths } from '../../routes';
import { normalizeInvitationAccessError, type InvitationAccessError } from '../problem';
import { acceptInvitation, exchangeInvitation, getInvitationSummary, startInvitationSaml } from '../requests';
import { useInvitationInitialization } from './useInvitationInitialization';

type PasswordDraft = { password: string; confirmation: string };
type InvitationAccessState = {
  summary: InvitationSummary | null;
  error: InvitationAccessError | null;
  busy: boolean;
  cooldown: number;
  draft: PasswordDraft;
  validationError: boolean;
  canStartSso: boolean;
  signIn: boolean;
  updateDraft: (field: keyof PasswordDraft, value: string) => void;
  readSummary: () => Promise<void>;
  submit: () => Promise<void>;
  startSso: () => Promise<void>;
};

export const useInvitationAccess = (): InvitationAccessState => {
  const auth = useAuth();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<InvitationSummary | null>(null);
  const [error, setError] = useState<InvitationAccessError | null>(null);
  const [busy, setBusy] = useState(true);
  const { cooldown, setCooldown } = useCooldown();
  const [draft, setDraft] = useState({ password: '', confirmation: '' });
  const [validationError, setValidationError] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const exchangeToken = useRef<string | null>(null);
  const bearer = auth.session?.token;
  const generation = useRef({
    userId: auth.loggedInUser?.id,
    storedSlug: getContextOrganizationSlugFromLS(),
    workspaceSlug: workspace.contextOrganizationSlug ?? '',
  });

  const isCurrent = (): boolean => {
    const stored = readStoredSession();
    const initial = generation.current;

    return (
      mounted.current &&
      stored.status !== 'unreadable' &&
      (stored.status === 'valid' ? stored.session.user.id : undefined) === initial.userId &&
      getContextOrganizationSlugFromLS() === initial.storedSlug &&
      (!initial.userId || initial.workspaceSlug === (initial.storedSlug ?? ''))
    );
  };

  useInvitationInitialization({
    bearer,
    mounted,
    exchangeToken,
    isCurrent,
    onSummary: setSummary,
    onError: (failure) => {
      setError(failure);
      setCooldown(failure.retryAfter);
    },
    onSettled: () => setBusy(false),
  });

  const readSummary = async (): Promise<void> => {
    if (!isCurrent() || inFlight.current || busy || cooldown) return;
    inFlight.current = true;
    setBusy(true);
    setSummary(null);
    setError(null);

    try {
      const result = exchangeToken.current
        ? await exchangeInvitation(exchangeToken.current, bearer)
        : await getInvitationSummary(bearer);
      if (isCurrent()) {
        exchangeToken.current = null;
        setSummary(result);
      }
    } catch (failure) {
      if (isCurrent()) {
        const safe = normalizeInvitationAccessError(failure);
        if (!['rate-limited', 'unavailable'].includes(safe.code)) exchangeToken.current = null;
        setError(safe);
        setCooldown(safe.retryAfter);
      }
    } finally {
      inFlight.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  const submit = async (): Promise<void> => {
    if (!isCurrent() || !summary || inFlight.current || busy || cooldown) return;
    const createsPassword = summary.nextAction === 'CreateAccount';
    if (summary.nextAction !== 'Accept' && !createsPassword) return;
    if (createsPassword && !InvitationPasswordSchema.safeParse(draft).success) {
      setValidationError(true);

      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);

    try {
      const joined = await acceptInvitation(summary, bearer, createsPassword ? draft.password : undefined);
      if (!isCurrent()) return;

      try {
        setDraft({ password: '', confirmation: '' });
        auth.persistSession(joined.accessToken, joined.organizationSlug);
        auth.persistRefreshToken(joined.refreshToken);
        workspace.checkIfContextOrganizationSlugIsInLocalStorage();
        navigate(paths.index);
      } catch {
        if (mounted.current) navigate(`${authPaths.invitationSignIn}?joined=1`, { replace: true });
      } finally {
        if (mounted.current) setBusy(false);
      }
    } catch (failure) {
      if (!isCurrent()) return;
      const safe = normalizeInvitationAccessError(failure);
      if (safe.code === 'revision-conflict') {
        // Never reuse old roles/revision/CSRF or auto-submit after a revision change.
        setSummary(null);

        try {
          const latest = await getInvitationSummary(bearer);
          if (isCurrent()) {
            setSummary(latest);
            setError(safe);
          }
        } catch (refreshFailure) {
          if (isCurrent()) {
            const refreshError = normalizeInvitationAccessError(refreshFailure);
            setError(refreshError);
            setCooldown(refreshError.retryAfter);
          }
        }
      } else {
        setError(safe);
        setCooldown(safe.retryAfter);
        if (safe.code !== 'invalid-request') setSummary(null);
        if (safe.code === 'session-issue-failed') setDraft({ password: '', confirmation: '' });
      }
    } finally {
      inFlight.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  const canStartSso = Boolean(
    summary?.ssoEnabled && ['CreateAccount', 'SignIn', 'VerifyLegacySso'].includes(summary.nextAction),
  );

  const startSso = async (): Promise<void> => {
    if (!isCurrent() || !summary || !canStartSso || inFlight.current || busy || cooldown) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);

    try {
      const redirect = await startInvitationSaml(summary.csrfToken, bearer);
      if (!isCurrent()) return;
      setSsoInvitationReturn(false);
      // The native SSO form destination comes only from the server invitation context.
      const form = document.createElement('form');
      form.method = 'get';
      form.action = redirect.ssoUrl;
      const request = document.createElement('input');
      request.type = 'hidden';
      request.name = 'SAMLRequest';
      request.value = redirect.samlRequest;
      form.append(request);
      document.body.append(form);

      try {
        form.submit();
      } finally {
        form.remove();
      }
    } catch (failure) {
      if (!isCurrent()) return;
      const safe = normalizeInvitationAccessError(failure);
      setError(safe);
      setCooldown(safe.retryAfter);
      setSummary(null);
      inFlight.current = false;
      setBusy(false);
    }
  };

  const signIn =
    summary?.nextAction === 'SignIn' ||
    summary?.nextAction === 'VerifyLegacySso' ||
    ['identity-mismatch', 'sign-in-required', 'session-issue-failed'].includes(error?.code ?? '');

  const updateDraft = (field: keyof PasswordDraft, value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }));
    setValidationError(false);
  };

  return {
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
  };
};
