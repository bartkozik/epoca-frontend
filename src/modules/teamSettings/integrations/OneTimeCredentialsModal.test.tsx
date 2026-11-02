import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import OneTimeCredentialsModal, { type OneTimeCredentials } from './OneTimeCredentialsModal';

const messages: Record<string, string> = {
  'team_seatings.integrations.credentials.title': 'Save client credentials',
  'team_seatings.integrations.credentials.warning':
    'Copy the secret now. It will not be available after you close this window.',
  'team_seatings.integrations.credentials.client_id': 'Client ID',
  'team_seatings.integrations.credentials.client_secret': 'Client secret',
  'team_seatings.integrations.credentials.copy.client_id': 'Copy client ID',
  'team_seatings.integrations.credentials.copy.client_secret': 'Copy client secret',
  'team_seatings.integrations.credentials.copied.client_id': 'Client ID copied.',
  'team_seatings.integrations.credentials.copied.client_secret': 'Client secret copied.',
  'team_seatings.integrations.credentials.copy_failed': 'Could not copy. Select and copy the value manually.',
  'team_seatings.integrations.credentials.acknowledge': 'I saved the client secret',
  'team_seatings.integrations.credentials.done': 'Done',
  'common.close': 'Close',
};

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => messages[key] ?? key }),
}));

const CREDENTIALS: OneTimeCredentials = {
  clientId: 'client-id-oauth-client',
  clientSecret: 'OAUTH_CLIENT_SECRET_SENTINEL_UI',
};

const installClipboard = (writeText: Mock): void => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
};

function CredentialsHarness(): JSX.Element {
  const [credentials, setCredentials] = useState<OneTimeCredentials | null>(null);

  return (
    <>
      <button onClick={() => setCredentials(CREDENTIALS)} type="button">
        Originating action
      </button>
      {credentials && <OneTimeCredentialsModal credentials={credentials} isOpen onDone={() => setCredentials(null)} />}
    </>
  );
}

describe('OneTimeCredentialsModal', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('cannot be dismissed accidentally and requires an explicit saved-secret acknowledgement', async () => {
    const user = userEvent.setup();
    render(<CredentialsHarness />);
    const origin = screen.getByRole('button', { name: 'Originating action' });

    await user.click(origin);

    const dialog = screen.getByRole('dialog', { name: 'Save client credentials' });
    const heading = screen.getByRole('heading', { level: 2, name: 'Save client credentials' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(heading).toHaveTextContent('Save client credentials');
    expect(screen.getByRole('textbox', { name: 'Client ID' })).toHaveValue(CREDENTIALS.clientId);
    expect(screen.getByRole('textbox', { name: 'Client secret' })).toHaveValue(CREDENTIALS.clientSecret);
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    const clientId = screen.getByRole('textbox', { name: 'Client ID' });
    expect(clientId).toHaveFocus();
    expect(clientId).toHaveProperty('selectionStart', 0);
    expect(clientId).toHaveProperty('scrollLeft', 0);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('checkbox', { name: 'I saved the client secret' })).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('textbox', { name: 'Client ID' })).toHaveFocus();

    fireEvent.mouseDown(document.body);
    await user.keyboard('{Escape}');

    expect(screen.getByRole('dialog', { name: 'Save client credentials' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'I saved the client secret' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('dialog', { name: 'Save client credentials' })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(CREDENTIALS.clientSecret)).not.toBeInTheDocument();
    expect(origin).toHaveFocus();
  });

  it('copies client ID and secret separately and announces success without repeating either value', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    installClipboard(writeText);
    render(<OneTimeCredentialsModal credentials={CREDENTIALS} isOpen onDone={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Copy client ID' }));
    expect(writeText).toHaveBeenLastCalledWith(CREDENTIALS.clientId);
    expect(await screen.findByRole('status')).toHaveTextContent('Client ID copied.');
    expect(screen.getByRole('status')).not.toHaveTextContent(CREDENTIALS.clientId);

    await user.click(screen.getByRole('button', { name: 'Copy client secret' }));
    expect(writeText).toHaveBeenLastCalledWith(CREDENTIALS.clientSecret);
    expect(await screen.findByRole('status')).toHaveTextContent('Client secret copied.');
    expect(screen.getByRole('status')).not.toHaveTextContent(CREDENTIALS.clientSecret);
  });

  it('handles clipboard rejection with safe copy guidance and no unhandled secret-bearing error', async () => {
    const user = userEvent.setup();
    installClipboard(vi.fn(() => Promise.reject(new Error(CREDENTIALS.clientSecret))));
    render(<OneTimeCredentialsModal credentials={CREDENTIALS} isOpen onDone={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Copy client secret' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy. Select and copy the value manually.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(CREDENTIALS.clientSecret);
  });

  it('removes the one-time value from the DOM on unmount', () => {
    const view = render(<OneTimeCredentialsModal credentials={CREDENTIALS} isOpen onDone={vi.fn()} />);
    expect(screen.getByDisplayValue(CREDENTIALS.clientSecret)).toBeInTheDocument();

    view.unmount();

    expect(screen.queryByDisplayValue(CREDENTIALS.clientSecret)).not.toBeInTheDocument();
  });
});
