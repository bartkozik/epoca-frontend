import api, { queryClient, removeRefreshToken } from '@/core/api';
import { LOCAL_STORAGE_AUTH_NAME } from '@/core/config/localStorageKeys';
import { paths } from '@/app/routing/paths';
import Button from '@/core/theme/button';
import Modal from '@/core/theme/modal';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { isAxiosError } from 'axios';
import { DemoGuide } from './DemoGuide';
import styles from './DemoShell.module.scss';
import { requestDemoSession, type DemoSession } from './requests';

export function DemoShell({ children }: PropsWithChildren): JSX.Element {
  const { persistSession, changeUserLanguage, loggedInUser } = useAuth();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const pending = useRef(false);
  const activeToken = useRef<string | null>(null);

  const acceptSession = useCallback(
    (next: DemoSession | null) => {
      if (next) {
        removeRefreshToken();
        persistSession(next.accessToken, next.organizationSlug);
      }
      activeToken.current = next?.accessToken ?? null;
      setSession(next);
    },
    [persistSession],
  );

  useEffect(() => {
    const controller = new AbortController();
    void requestDemoSession('resume', controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) acceptSession(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not connect to the demo. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [acceptSession]);

  useEffect(() => {
    const id = api.interceptors.response.use(undefined, (cause: unknown) => {
      if (
        isAxiosError(cause) &&
        cause.response?.status === 401 &&
        activeToken.current &&
        cause.config?.headers?.Authorization === `Bearer ${activeToken.current}`
      ) {
        activeToken.current = null;
        setSession(null);
        setError('Your workspace session has ended or changed in another tab. Open the demo again to continue.');
      }
      return Promise.reject(cause instanceof Error ? cause : new Error(String(cause)));
    });
    return () => api.interceptors.response.eject(id);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== LOCAL_STORAGE_AUTH_NAME.ACCESS_TOKEN && event.key !== null) return;
      activeToken.current = null;
      setSession(null);
      setError('Your workspace changed in another tab. Open the demo again to continue.');
      void queryClient.cancelQueries();
      queryClient.clear();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    const timer = window.setTimeout(
      () => {
        setSession(null);
        activeToken.current = null;
        setError('Your demo session has expired. Open a new workspace to continue.');
      },
      Math.max(0, Date.parse(session.expiresAt) - Date.now() - 60_000),
    );
    return () => window.clearTimeout(timer);
  }, [session]);

  async function openDemo(reset: boolean): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setConfirmReset(false);
    try {
      await queryClient.cancelQueries();
      const next = await requestDemoSession(reset ? 'reset' : 'start');
      queryClient.clear();
      if (!reset) changeUserLanguage('en');
      window.history.replaceState(null, '', paths.index);
      acceptSession(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (!session || !loggedInUser) {
    return (
      <main className={styles.welcome}>
        <section className={styles.panel} aria-labelledby="demo-title">
          <p className={styles.eyebrow}>EPOCA · Interactive demo</p>
          <h1 id="demo-title">A working day, without the paperwork.</h1>
          <p>Explore time tracking, projects and reporting in your own temporary workspace. No account required.</p>
          <DemoGuide />
          <p>
            All people and businesses are fictional. Changes are temporary and expire within 24 hours. Please do not
            enter personal or confidential information.
          </p>
          <p>Company login, invitations, uploads and external integrations are disabled in this demo.</p>
          {error && <p role="alert">{error}</p>}
          <div className={styles.actions}>
            <Button
              label={busy ? 'Preparing demo…' : 'Open demo'}
              loading={busy}
              disabled={busy}
              onClick={() => void openDemo(false)}
            />
            <a href="https://kozikowski.it/projects/epoca">Back to portfolio</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      <aside className={styles.banner} aria-label="Demo workspace">
        <div>
          <strong>EPOCA demo</strong>
          <span> Your private sample workspace · expires after 24h</span>
        </div>
        <div className={styles.actions}>
          <Button label="Quick guide" size="small" variant="outlined" onClick={() => setShowGuide(true)} />
          <Button
            label="Reset demo"
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={() => setConfirmReset(true)}
          />
          <a href="https://kozikowski.it/projects/epoca">Portfolio</a>
        </div>
      </aside>
      {error && (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      )}
      {busy ? (
        <p className={styles.notice} role="status">
          Preparing your workspace…
        </p>
      ) : (
        children
      )}
      <Modal
        isOpen={showGuide}
        close={() => setShowGuide(false)}
        ariaLabelledBy="demo-guide-title"
        className={styles.panel}
      >
        <h2 id="demo-guide-title">Try EPOCA in a few minutes</h2>
        <DemoGuide />
        <p>Sample data only. Sessions last up to 24 hours; integrations and downloads are unavailable.</p>
        <Button label="Got it" onClick={() => setShowGuide(false)} />
      </Modal>
      <Modal
        isOpen={confirmReset}
        close={() => setConfirmReset(false)}
        ariaLabelledBy="demo-reset-title"
        className={styles.panel}
      >
        <h2 id="demo-reset-title">Restore the sample workspace?</h2>
        <p>This removes your demo changes and creates fresh fictional data. Other visitors are not affected.</p>
        <div className={styles.actions}>
          <Button label="Keep exploring" variant="outlined" onClick={() => setConfirmReset(false)} />
          <Button label="Reset demo" onClick={() => void openDemo(true)} />
        </div>
      </Modal>
    </>
  );
}
