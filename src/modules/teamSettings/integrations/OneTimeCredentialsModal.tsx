import Button from '@/core/theme/button';
import { Input } from '@/core/theme/inputs';
import Modal from '@/core/theme/modal';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './OneTimeCredentialsModal.module.scss';

export interface OneTimeCredentials {
  clientId: string;
  clientSecret: string;
}

interface OneTimeCredentialsModalProps {
  credentials: OneTimeCredentials;
  isOpen: boolean;
  onDone: () => void;
}

type CopyTarget = 'client_id' | 'client_secret';

interface CopyAnnouncement {
  key: string;
  role: 'alert' | 'status';
}

const OneTimeCredentialsModal = ({ credentials, isOpen, onDone }: OneTimeCredentialsModalProps): JSX.Element | null => {
  const { t } = useTranslation();
  const titleId = useId();
  const announcementId = useId();
  const clientIdRef = useRef<HTMLInputElement>(null);
  const doneGuardRef = useRef(false);
  const mountedRef = useRef(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [announcement, setAnnouncement] = useState<CopyAnnouncement | null>(null);

  useEffect(
    () => () => {
      mountedRef.current = false;
      doneGuardRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!isOpen) return;
    mountedRef.current = true;
    doneGuardRef.current = false;
    setAcknowledged(false);
    setAnnouncement(null);
    clientIdRef.current?.setSelectionRange(0, 0);
    if (clientIdRef.current) clientIdRef.current.scrollLeft = 0;
  }, [credentials.clientId, credentials.clientSecret, isOpen]);

  if (!isOpen) return null;

  const announce = (nextAnnouncement: CopyAnnouncement): void => {
    if (mountedRef.current) setAnnouncement(nextAnnouncement);
  };

  const copy = (target: CopyTarget, value: string): void => {
    setAnnouncement(null);
    let copyRequest: Promise<void>;
    try {
      copyRequest = navigator.clipboard.writeText(value);
    } catch {
      announce({ key: 'team_seatings.integrations.credentials.copy_failed', role: 'alert' });
      return;
    }

    void Promise.resolve(copyRequest).then(
      () =>
        announce({
          key: `team_seatings.integrations.credentials.copied.${target}`,
          role: 'status',
        }),
      () => announce({ key: 'team_seatings.integrations.credentials.copy_failed', role: 'alert' }),
    );
  };

  const done = (): void => {
    if (!acknowledged || doneGuardRef.current) return;
    doneGuardRef.current = true;
    setAcknowledged(false);
    setAnnouncement(null);
    onDone();
  };

  return (
    <Modal
      ariaLabelledBy={titleId}
      className={styles.modal}
      disableClickOutside
      disableEscapeClickClose
      isOpen={isOpen}
    >
      <h2 className={styles.modalTitle} id={titleId}>
        {t('team_seatings.integrations.credentials.title')}
      </h2>
      <p className={styles.warning}>{t('team_seatings.integrations.credentials.warning')}</p>

      <div className={styles.credentials}>
        <div className={styles.credential}>
          <Input
            className={styles.credentialField}
            isLabelBold
            label={t('team_seatings.integrations.credentials.client_id')}
            name={`${titleId}-client-id`}
            readOnly
            ref={clientIdRef}
            type="text"
            value={credentials.clientId}
          />
          <Button
            aria-describedby={announcement?.role === 'status' ? announcementId : undefined}
            aria-label={t('team_seatings.integrations.credentials.copy.client_id')}
            className={styles.copyButton}
            label={t('team_seatings.integrations.credentials.copy.client_id')}
            onClick={() => copy('client_id', credentials.clientId)}
            variant="outlined"
          />
        </div>
        <div className={styles.credential}>
          <Input
            className={styles.credentialField}
            isLabelBold
            label={t('team_seatings.integrations.credentials.client_secret')}
            name={`${titleId}-client-secret`}
            readOnly
            type="text"
            value={credentials.clientSecret}
          />
          <Button
            aria-describedby={announcement?.role === 'status' ? announcementId : undefined}
            aria-label={t('team_seatings.integrations.credentials.copy.client_secret')}
            className={styles.copyButton}
            label={t('team_seatings.integrations.credentials.copy.client_secret')}
            onClick={() => copy('client_secret', credentials.clientSecret)}
            variant="outlined"
          />
        </div>
      </div>

      <div aria-live="polite" className={styles.announcement} id={announcementId} role={announcement?.role}>
        {announcement ? t(announcement.key) : ''}
      </div>

      <label className={styles.acknowledgement}>
        <input checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} type="checkbox" />
        <span>{t('team_seatings.integrations.credentials.acknowledge')}</span>
      </label>

      <div className={styles.footer}>
        <Button disabled={!acknowledged} label={t('team_seatings.integrations.credentials.done')} onClick={done} />
      </div>
    </Modal>
  );
};

export default OneTimeCredentialsModal;
