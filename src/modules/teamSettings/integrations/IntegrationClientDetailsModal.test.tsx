import type {
  IntegrationClient,
  IntegrationClientAuditEvent,
  IntegrationClientStatus,
} from '@/modules/integrationClients/types';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IntegrationClientDetailsModal from './IntegrationClientDetailsModal';

const messages: Record<string, string> = {
  'team_seatings.integrations.action.edit': 'Edit',
  'team_seatings.integrations.action.renew': 'Renew',
  'team_seatings.integrations.action.revoke': 'Revoke',
  'team_seatings.integrations.action.rotate': 'Rotate secret',
  'team_seatings.integrations.date_unavailable': 'Unavailable',
  'team_seatings.integrations.details.audit.actor.Anonymous': 'Anonymous',
  'team_seatings.integrations.details.audit.actor.System': 'System',
  'team_seatings.integrations.details.audit.empty': 'No audit events yet.',
  'team_seatings.integrations.details.audit.event.Create': 'Client created',
  'team_seatings.integrations.details.audit.event.Rotate': 'Secret rotated',
  'team_seatings.integrations.details.audit.heading': 'Audit history',
  'team_seatings.integrations.details.audit.load_more': 'Load more audit events',
  'team_seatings.integrations.details.audit.loading': 'Loading audit history…',
  'team_seatings.integrations.details.audit.outcome.Failure': 'Failed',
  'team_seatings.integrations.details.audit.outcome.Success': 'Succeeded',
  'team_seatings.integrations.details.client_id': 'Client ID',
  'team_seatings.integrations.details.copy.client_id': 'Copy client ID',
  'team_seatings.integrations.details.copied.client_id': 'Client ID copied.',
  'team_seatings.integrations.details.copy_failed': 'Could not copy the client ID.',
  'team_seatings.integrations.details.created': 'Created',
  'team_seatings.integrations.details.expires': 'Expires',
  'team_seatings.integrations.details.last_used': 'Last used',
  'team_seatings.integrations.details.loading': 'Loading client details…',
  'team_seatings.integrations.details.modified': 'Modified',
  'team_seatings.integrations.details.never': 'Never',
  'team_seatings.integrations.details.not_applicable': 'Not applicable',
  'team_seatings.integrations.details.policy': 'Project access',
  'team_seatings.integrations.details.policy.AllProjects': 'All current and future projects',
  'team_seatings.integrations.details.policy.SelectedProjects': 'Selected projects',
  'team_seatings.integrations.details.policy.project_ids': 'Project IDs',
  'team_seatings.integrations.details.revoked': 'Revoked',
  'team_seatings.integrations.details.rotated': 'Secret rotated',
  'team_seatings.integrations.details.scopes': 'Permissions',
  'team_seatings.integrations.details.service_account': 'Service account',
  'team_seatings.integrations.details.status': 'Status',
  'team_seatings.integrations.details.title': 'Integration client details',
  'team_seatings.integrations.details.version.client': 'Client version',
  'team_seatings.integrations.details.version.policy': 'Policy version',
  'team_seatings.integrations.details.version.secret': 'Secret version',
  'team_seatings.integrations.form.scope.projects:read': 'Read projects',
  'team_seatings.integrations.form.scope.reports:export': 'Export reports',
  'team_seatings.integrations.no_expiration': 'No expiration',
  'team_seatings.integrations.status.Active': 'Active',
  'team_seatings.integrations.status.Expired': 'Expired',
  'team_seatings.integrations.status.Revoked': 'Revoked',
  'common.close': 'Close',
};

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => messages[key] ?? key }),
}));

const actor = {
  userId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Safe actor',
};
const serviceAccount = {
  userId: '22222222-2222-4222-8222-222222222222',
  displayName: 'Automation service account',
};
const client: IntegrationClient = {
  clientId: 'oauth-client-full-identifier',
  name: 'Reporting warehouse',
  status: 'Revoked',
  scopes: ['projects:read', 'reports:export'],
  projectAccess: {
    mode: 'SelectedProjects',
    projectIds: ['11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444'],
  },
  version: 9,
  policyVersion: 6,
  secretVersion: 4,
  serviceAccount,
  createdAt: '2026-01-01T08:00:00Z',
  createdBy: actor,
  modifiedAt: '2026-02-01T09:15:00Z',
  modifiedBy: actor,
  secretRotatedAt: '2026-03-01T10:30:00Z',
  secretRotatedBy: actor,
  expiresAt: '2027-01-01T11:45:00Z',
  revokedAt: '2026-04-01T12:00:00Z',
  revokedBy: actor,
  lastUsedAt: '2026-03-15T13:15:00Z',
};

const audit = (
  id: string,
  occurredAt: string,
  eventType: IntegrationClientAuditEvent['eventType'],
  overrides: Partial<IntegrationClientAuditEvent> = {},
): IntegrationClientAuditEvent => ({
  id,
  occurredAt,
  actorType: 'Human',
  actorUserId: actor.userId,
  actor,
  eventType,
  outcome: 'Success',
  metadata: {},
  ...overrides,
});

const baseProps = {
  auditEvents: [] as IntegrationClientAuditEvent[],
  auditHasNextPage: false,
  auditState: 'success' as const,
  client,
  detailState: 'success' as const,
  isDetailFresh: true,
  isOpen: true,
  locale: 'en-GB',
  onClose: vi.fn(),
  onEdit: vi.fn(),
  onLoadMoreAudit: vi.fn(),
  onRetryAudit: vi.fn(),
  onRetryDetails: vi.fn(),
  onRevoke: vi.fn(),
  onRotate: vi.fn(),
};

describe('IntegrationClientDetailsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps keyboard focus inside the dialog while exposing translated lifecycle action names', async () => {
    const user = userEvent.setup();
    render(<IntegrationClientDetailsModal {...baseProps} client={{ ...client, status: 'Active' }} />);

    const close = screen.getByRole('button', { name: 'Close' });
    const copyClientId = screen.getByRole('button', { name: 'Copy client ID' });
    expect(close).toHaveFocus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(copyClientId).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(close).toHaveFocus();
  });

  it('shows every safe CT-537 field, localized lifecycle dates, and newest-first paginated audit without private actor or raw metadata fields', async () => {
    const user = userEvent.setup();
    const newer = audit('55555555-5555-4555-8555-555555555555', '2026-05-02T14:00:00Z', 'Rotate', {
      metadata: { secretVersion: 4 },
    });
    const older = audit('66666666-6666-4666-8666-666666666666', '2026-05-01T14:00:00Z', 'Create', {
      actor: null,
      actorType: 'System',
      actorUserId: null,
      metadata: { version: 1 },
    });
    const privateActorFields = {
      ...actor,
      email: 'private@example.test',
      login: 'private-login',
      role: 'Owner',
      superadmin: 'true',
    };
    const clientWithPrivateTransportFields = {
      ...client,
      createdBy: privateActorFields,
      modifiedBy: privateActorFields,
      secretRotatedBy: privateActorFields,
      revokedBy: privateActorFields,
    } as unknown as IntegrationClient;

    const { container } = render(
      <IntegrationClientDetailsModal
        {...baseProps}
        auditEvents={[older, newer]}
        auditHasNextPage
        client={clientWithPrivateTransportFields}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Integration client details' });
    const heading = screen.getByRole('heading', { level: 2, name: 'Integration client details' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(heading).toHaveTextContent('Integration client details');
    expect(screen.getByText('Reporting warehouse')).toBeInTheDocument();
    expect(screen.getByText('oauth-client-full-identifier')).toBeInTheDocument();
    expect(screen.getByText('Revoked', { selector: '[data-status]' })).toBeInTheDocument();
    expect(screen.getByText('Automation service account')).toBeInTheDocument();
    expect(screen.getByText(serviceAccount.userId)).toBeInTheDocument();
    expect(screen.getByText('Read projects')).toBeInTheDocument();
    expect(screen.getByText('Export reports')).toBeInTheDocument();
    expect(screen.getByText('Selected projects')).toBeInTheDocument();
    expect(
      screen.getByText(client.projectAccess.mode === 'SelectedProjects' ? client.projectAccess.projectIds[0] : ''),
    ).toBeInTheDocument();
    expect(
      screen.getByText(client.projectAccess.mode === 'SelectedProjects' ? client.projectAccess.projectIds[1] : ''),
    ).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getAllByText('Safe actor')).toHaveLength(5);

    [
      client.createdAt,
      client.modifiedAt,
      client.secretRotatedAt,
      client.expiresAt,
      client.revokedAt,
      client.lastUsedAt,
      older.occurredAt,
      newer.occurredAt,
    ]
      .filter((instant): instant is string => instant !== null)
      .forEach((instant) => {
        expect(
          screen.getByText(
            new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(instant)),
          ),
        ).toBeInTheDocument();
      });

    const entries = screen.getAllByRole('listitem').filter((entry) => entry.dataset.auditEvent === 'true');
    expect(within(entries[0]).getByText('Secret rotated')).toBeInTheDocument();
    expect(within(entries[1]).getByText('Client created')).toBeInTheDocument();
    expect(within(entries[1]).getByText('System')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('private@example.test');
    expect(container).not.toHaveTextContent('private-login');
    expect(container).not.toHaveTextContent('Owner');
    expect(container).not.toHaveTextContent('superadmin');
    expect(container).not.toHaveTextContent('secretVersion');
    expect(container).not.toHaveTextContent('version: 1');

    await user.click(screen.getByRole('button', { name: 'Load more audit events' }));
    expect(baseProps.onLoadMoreAudit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Active', ['Edit', 'Rotate secret', 'Revoke']],
    ['Expired', ['Renew', 'Revoke']],
    ['Revoked', []],
  ] as const)(
    'exposes only %s lifecycle actions and disables all available actions while another mutation is pending',
    (status: IntegrationClientStatus, expectedActions: readonly string[]) => {
      const lifecycleClient = { ...client, status };
      const view = render(<IntegrationClientDetailsModal {...baseProps} client={lifecycleClient} />);

      expectedActions.forEach((action) => expect(screen.getByRole('button', { name: action })).toBeEnabled());
      ['Edit', 'Renew', 'Rotate secret', 'Revoke']
        .filter((action) => !expectedActions.includes(action as never))
        .forEach((action) => expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument());

      view.rerender(<IntegrationClientDetailsModal {...baseProps} client={lifecycleClient} isBusy />);
      expectedActions.forEach((action) => expect(screen.getByRole('button', { name: action })).toBeDisabled());
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    },
  );

  it('renders safe retryable detail and audit states without replacing already loaded metadata', async () => {
    const user = userEvent.setup();
    const view = render(
      <IntegrationClientDetailsModal {...baseProps} auditState="error" client={null} detailState="error" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('team_seatings.integrations.details.error');
    await user.click(screen.getByRole('button', { name: 'team_seatings.integrations.details.retry' }));
    expect(baseProps.onRetryDetails).toHaveBeenCalledTimes(1);

    view.rerender(<IntegrationClientDetailsModal {...baseProps} auditState="error" />);
    expect(screen.getByText('Reporting warehouse')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('team_seatings.integrations.details.audit.error');
    await user.click(screen.getByRole('button', { name: 'team_seatings.integrations.details.audit.retry' }));
    expect(baseProps.onRetryAudit).toHaveBeenCalledTimes(1);
  });
});

it('keeps demo details and audit readable with mutation controls disabled', () => {
  render(<IntegrationClientDetailsModal {...baseProps} client={{ ...client, status: 'Active' }} readOnly />);
  expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Rotate secret' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
  expect(screen.getByText('Audit history')).toBeVisible();
});
