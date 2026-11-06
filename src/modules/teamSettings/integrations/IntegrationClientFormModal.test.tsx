import type { IntegrationClient, IntegrationClientProblem } from '@/modules/integrationClients/types';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import IntegrationClientFormModal, {
  type IntegrationClientProjectCatalogState,
  type IntegrationClientProjectOption,
} from './IntegrationClientFormModal';

const messages: Record<string, string> = {
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.modal': 'Modal',
  'team_seatings.integrations.form.title.create': 'Create integration client',
  'team_seatings.integrations.form.title.edit': 'Edit integration client',
  'team_seatings.integrations.form.title.renew': 'Renew integration client',
  'team_seatings.integrations.form.submit.create': 'Create client',
  'team_seatings.integrations.form.submit.edit': 'Save changes',
  'team_seatings.integrations.form.submit.renew': 'Renew client',
  'team_seatings.integrations.form.name': 'Client name',
  'team_seatings.integrations.form.scopes': 'Permissions',
  'team_seatings.integrations.form.projects': 'Project access',
  'team_seatings.integrations.form.project_access.AllProjects': 'All current and future projects',
  'team_seatings.integrations.form.project_access.AllProjects.helper': 'New projects will be included automatically.',
  'team_seatings.integrations.form.project_access.SelectedProjects': 'Selected projects',
  'team_seatings.integrations.form.project_choices': 'Available projects',
  'team_seatings.integrations.form.expiration': 'Expiration',
  'team_seatings.integrations.form.expiration.none': 'No expiration',
  'team_seatings.integrations.form.expiration.expires': 'Expires at',
  'team_seatings.integrations.form.expiration.datetime': 'Expiration date and time',
  'team_seatings.integrations.form.error.name.required': 'Enter a client name.',
  'team_seatings.integrations.form.error.scopes.required': 'Select at least one permission.',
  'team_seatings.integrations.form.error.scopes.invalid': 'Select valid permissions.',
  'team_seatings.integrations.form.error.projects.required': 'Select at least one active project.',
  'team_seatings.integrations.form.error.projects.invalid': 'One or more projects are unavailable.',
  'team_seatings.integrations.form.error.expiresAt.invalid': 'Enter a valid expiration date and time.',
  'team_seatings.integrations.form.error.expiresAt.future': 'Expiration must be in the future.',
  'team_seatings.integrations.form.error.form.no-changes': 'Make a change before saving.',
  'team_seatings.integrations.form.error.name-conflict': 'This client name is already in use.',
  'team_seatings.integrations.form.error.invalid-expiration': 'Choose a valid future expiration.',
  'team_seatings.integrations.form.error.invalid-policy': 'Review permissions and project access.',
  'team_seatings.integrations.form.error.stale-version.with-version':
    'This client changed elsewhere (current version: {currentVersion}). Refresh before retrying.',
  'team_seatings.integrations.form.error.stale-version.without-version':
    'This client changed elsewhere, but its current version is unavailable. Refresh before retrying.',
  'team_seatings.integrations.form.error.not-active': 'This client is no longer active. Refresh its status.',
  'team_seatings.integrations.form.error.client-not-found': 'This client is no longer available.',
  'team_seatings.integrations.form.error.forbidden': 'You do not have permission to change this client.',
  'team_seatings.integrations.form.error.retry':
    'The change could not be saved. Your entries are preserved; try again.',
  'team_seatings.integrations.form.error.refresh': 'The latest client could not be loaded. Your entries are preserved.',
  'team_seatings.integrations.form.refresh': 'Refresh client',
  'team_seatings.integrations.form.confirm_all.title': 'Include future projects?',
  'team_seatings.integrations.form.confirm_all.text': 'All projects also grants access to projects created later.',
  'team_seatings.integrations.form.confirm_all.confirm': 'Use all projects',
  'team_seatings.integrations.form.scope.organization:read': 'Read organization',
  'team_seatings.integrations.form.scope.users:read': 'Read users',
  'team_seatings.integrations.form.scope.clients:read': 'Read clients',
  'team_seatings.integrations.form.scope.projects:read': 'Read projects',
  'team_seatings.integrations.form.scope.work-units:read': 'Read work units',
  'team_seatings.integrations.form.scope.work-units:write': 'Write work units',
  'team_seatings.integrations.form.scope.reports:read': 'Read reports',
  'team_seatings.integrations.form.scope.reports:export': 'Export reports',
};

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    i18n: { language: 'en', resolvedLanguage: 'en' },
    t: (key: string, values?: Record<string, string | number>) =>
      (messages[key] ?? key).replace('{currentVersion}', String(values?.currentVersion ?? '')),
  }),
}));

const ACTOR = {
  userId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Client owner',
};
const PROJECT_ONE = '11111111-1111-4111-8111-111111111111';
const PROJECT_TWO = '22222222-2222-4222-8222-222222222222';

const createClient = (overrides: Partial<IntegrationClient> = {}): IntegrationClient => ({
  clientId: 'client-1',
  name: 'Reporting app',
  status: 'Active',
  scopes: ['projects:read', 'reports:read'],
  projectAccess: { mode: 'SelectedProjects', projectIds: [PROJECT_ONE] },
  version: 7,
  policyVersion: 3,
  secretVersion: 2,
  serviceAccount: ACTOR,
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: ACTOR,
  modifiedAt: '2026-01-01T00:00:00Z',
  modifiedBy: ACTOR,
  secretRotatedAt: '2026-01-01T00:00:00Z',
  secretRotatedBy: ACTOR,
  expiresAt: '2027-12-01T10:15:00Z',
  revokedAt: null,
  revokedBy: null,
  lastUsedAt: null,
  ...overrides,
});

const projects: IntegrationClientProjectOption[] = [
  { id: PROJECT_ONE, name: 'Alpha project', archived: false },
  { id: PROJECT_TWO, name: 'Beta project', archived: false },
  { id: '99999999-9999-4999-8999-999999999999', name: 'Archived project', archived: true },
];

interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const renderCreate = (
  overrides: {
    onClose?: Mock;
    onSubmit?: Mock;
    projectCatalogState?: IntegrationClientProjectCatalogState;
  } = {},
): ReturnType<typeof render> & { onClose: Mock; onSubmit: Mock } => {
  const onClose = overrides.onClose ?? vi.fn();
  const onSubmit = overrides.onSubmit ?? vi.fn<(arg: unknown) => Promise<void>>(() => Promise.resolve());
  return {
    ...render(
      <IntegrationClientFormModal
        isOpen
        mode="create"
        now={() => new Date('2026-02-01T00:00:00Z')}
        onClose={onClose}
        onSubmit={onSubmit}
        projectCatalogState={overrides.projectCatalogState}
        projects={projects}
      />,
    ),
    onClose,
    onSubmit,
  };
};

const renderEdit = (
  overrides: {
    client?: IntegrationClient;
    mode?: 'edit' | 'renew';
    onClose?: Mock;
    onRefresh?: Mock;
    onSubmit?: Mock;
  } = {},
): ReturnType<typeof render> & {
  client: IntegrationClient;
  onClose: Mock;
  onRefresh: Mock;
  onSubmit: Mock;
} => {
  const mode = overrides.mode ?? 'edit';
  const client = overrides.client ?? createClient({ status: mode === 'renew' ? 'Expired' : 'Active' });
  const onClose = overrides.onClose ?? vi.fn();
  const onSubmit = overrides.onSubmit ?? vi.fn<(arg: unknown) => Promise<void>>(() => Promise.resolve());
  const onRefresh = overrides.onRefresh ?? vi.fn<() => Promise<IntegrationClient>>(() => Promise.resolve(client));
  return {
    ...render(
      <IntegrationClientFormModal
        client={client}
        isOpen
        mode={mode}
        now={() => new Date('2026-02-01T00:00:00Z')}
        onClose={onClose}
        onRefresh={onRefresh}
        onSubmit={onSubmit}
        projects={projects}
      />,
    ),
    client,
    onClose,
    onRefresh,
    onSubmit,
  };
};

const completeCreateBasics = async (): Promise<void> => {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Client name' }), 'New app');
  await user.click(screen.getByRole('checkbox', { name: 'Read projects' }));
};

const openProjectPicker = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
  await user.click(screen.getByRole('combobox', { name: 'Available projects' }));
  return screen.getByTestId('multi-search-options');
};

const projectOption = (picker: HTMLElement, name: string): HTMLElement =>
  within(picker).getByRole('option', { name: new RegExp(`^${name}`) });

describe('IntegrationClientFormModal modes and accessible fields', () => {
  it('renders create defaults, an eight-scope native fieldset, and initially focuses name', () => {
    renderCreate();

    const dialog = screen.getByRole('dialog', { name: 'Create integration client' });
    const heading = screen.getByRole('heading', { level: 2, name: 'Create integration client' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(heading).toHaveTextContent('Create integration client');
    expect(screen.getByRole('button', { name: 'Create client' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Client name' })).toHaveFocus();
    expect(screen.getByRole('group', { name: 'Permissions' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Permissions' })).getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.getByRole('radio', { name: 'All current and future projects' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'No expiration' })).toBeChecked();
    expect(screen.queryByLabelText('Expiration date and time')).not.toBeInTheDocument();
  });

  it('keeps keyboard focus trapped between the form controls and translated close action', async () => {
    const user = userEvent.setup();
    renderCreate();

    const close = screen.getByRole('button', { name: 'Close' });
    const submit = screen.getByRole('button', { name: 'Create client' });
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(close).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(submit).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(close).toHaveFocus();
  });

  it('renders edit and renew public defaults with distinct labels', () => {
    const view = renderEdit();
    expect(screen.getByRole('dialog', { name: 'Edit integration client' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Client name' })).toHaveValue('Reporting app');
    expect(screen.getByRole('checkbox', { name: 'Read projects' })).toBeChecked();
    view.unmount();

    renderEdit({ mode: 'renew', client: createClient({ status: 'Expired', expiresAt: '2026-01-01T00:00:00Z' }) });
    expect(screen.getByRole('dialog', { name: 'Renew integration client' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renew client' })).toBeEnabled();
  });

  it('guards invalid edit/renew lifecycle combinations and revoked clients', () => {
    const { container, rerender } = render(
      <IntegrationClientFormModal
        client={createClient({ status: 'Revoked' })}
        isOpen
        mode="edit"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        projects={projects}
      />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <IntegrationClientFormModal
        client={createClient({ status: 'Active' })}
        isOpen
        mode="renew"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        projects={projects}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows accessible validation errors and focuses the first invalid field', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCreate();

    await user.click(screen.getByRole('button', { name: 'Create client' }));

    expect(await screen.findByText('Enter a client name.')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Select at least one permission.')).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('textbox', { name: 'Client name' })).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows datetime-local only for explicit expiration and validates a future value', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.click(screen.getByRole('radio', { name: 'Expires at' }));
    const expiresAt = screen.getByLabelText('Expiration date and time');
    expect(expiresAt).toHaveAttribute('type', 'datetime-local');

    await completeCreateBasics();
    fireEvent.change(expiresAt, { target: { value: '2026-01-01T00:00' } });
    await user.click(screen.getByRole('button', { name: 'Create client' }));
    expect(await screen.findByText('Expiration must be in the future.')).toHaveAttribute('role', 'alert');
  });
});

describe('IntegrationClientFormModal project access', () => {
  it('marks the complete option disabled for catalog and submit blocking states', async () => {
    const user = userEvent.setup();
    const { unmount } = renderCreate({ projectCatalogState: 'loading' });
    await user.click(screen.getByRole('radio', { name: 'Selected projects' }));
    expect(screen.getByRole('combobox', { name: 'Available projects' })).toHaveAttribute('readonly');
    unmount();

    const pending = deferred<void>();
    renderCreate({ onSubmit: vi.fn(() => pending.promise) });
    await completeCreateBasics();
    await user.click(screen.getByRole('button', { name: 'Create client' }));
    const permissions = screen.getByRole('group', { name: 'Permissions' });
    const projectAccess = screen.getByRole('group', { name: 'Project access' });
    const busyScope = within(permissions).getByRole('checkbox', { name: 'Read projects' });
    const busyAccessMode = within(projectAccess).getByRole('radio', { name: 'All current and future projects' });
    expect(busyScope).toBeDisabled();
    expect(
      within(permissions).getByText('Read projects', { selector: 'label[data-disabled="true"] span' }),
    ).toBeInTheDocument();
    expect(busyAccessMode).toBeDisabled();
    expect(
      within(projectAccess).getByText('All current and future projects', {
        selector: 'label[data-disabled="true"] span',
      }),
    ).toBeInTheDocument();
    await act(() => {
      pending.resolve();
      return Promise.resolve();
    });
  });

  it('offers only active projects and submits exact selected ids', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCreate();
    await completeCreateBasics();
    await user.click(screen.getByRole('radio', { name: 'Selected projects' }));
    const picker = await openProjectPicker(user);

    expect(projectOption(picker, 'Alpha project')).toHaveAttribute('aria-selected', 'false');
    expect(projectOption(picker, 'Beta project')).toHaveAttribute('aria-selected', 'false');
    expect(within(picker).queryByText('Archived project')).not.toBeInTheDocument();
    const reopenedPicker = await openProjectPicker(user);
    await user.click(within(reopenedPicker).getByText('Beta project'));
    await user.click(screen.getByRole('button', { name: 'Create client' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'New app',
      scopes: ['projects:read'],
      projectAccess: { mode: 'SelectedProjects', projectIds: [PROJECT_TWO] },
      expiresAt: null,
    });
  });

  it('keeps create project-access toggles draft-only and shows the all-projects helper only for all projects', async () => {
    const user = userEvent.setup();
    renderCreate();
    const allProjects = screen.getByRole('radio', { name: 'All current and future projects' });
    const projectAccess = screen.getByRole('group', { name: 'Project access' });
    const permissions = screen.getByRole('group', { name: 'Permissions' });
    const helper = within(projectAccess).getByText('New projects will be included automatically.');

    expect(helper).toBeInTheDocument();
    expect(within(permissions).queryByText('New projects will be included automatically.')).not.toBeInTheDocument();
    expect(allProjects).toHaveAccessibleName('All current and future projects');
    expect(allProjects).toHaveAccessibleDescription('New projects will be included automatically.');
    expect(allProjects).toHaveAttribute('aria-describedby', helper.id);
    expect(projectAccess).not.toHaveAttribute('aria-describedby', expect.stringContaining(helper.id));
    expect(
      within(projectAccess).getByText('New projects will be included automatically.', { selector: 'label span' }),
    ).toBe(helper);
    await user.click(screen.getByRole('radio', { name: 'Selected projects' }));
    expect(screen.queryByText('New projects will be included automatically.')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Include future projects?' })).not.toBeInTheDocument();

    await user.click(allProjects);
    expect(screen.getByText('New projects will be included automatically.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Include future projects?' })).not.toBeInTheDocument();
  });

  it('submits a valid create with default all-project access without confirmation', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCreate();
    await completeCreateBasics();

    await user.click(screen.getByRole('button', { name: 'Create client' }));

    expect(screen.queryByRole('dialog', { name: 'Include future projects?' })).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'New app',
      scopes: ['projects:read'],
      projectAccess: { mode: 'AllProjects' },
      expiresAt: null,
    });
  });

  it('opens the confirmation only after a valid edit save and cancel preserves the complete draft', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderEdit();
    const name = screen.getByRole('textbox', { name: 'Client name' });
    await user.type(name, ' preserved draft');
    const preservedName = (name as HTMLInputElement).value;
    await user.click(screen.getByRole('checkbox', { name: 'Read users' }));
    await user.click(screen.getByRole('radio', { name: 'Expires at' }));
    fireEvent.change(screen.getByLabelText('Expiration date and time'), {
      target: { value: '2027-12-02T10:15' },
    });
    const allProjects = screen.getByRole('radio', { name: 'All current and future projects' });
    const selectedProjects = screen.getByRole('radio', { name: 'Selected projects' });
    expect(selectedProjects).toBeChecked();
    expect(projectOption(await openProjectPicker(user), 'Alpha project')).toHaveAttribute('aria-selected', 'true');

    await user.click(allProjects);
    expect(allProjects).toBeChecked();
    expect(screen.queryByRole('dialog', { name: 'Include future projects?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Available projects' })).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const warning = screen.getByRole('dialog', { name: 'Include future projects?' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: 'Edit integration client' })).not.toBeInTheDocument();
    expect(within(warning).getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(within(warning).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Edit integration client' })).toBeInTheDocument();
    const restoredAllProjects = screen.getByRole('radio', { name: 'All current and future projects' });
    expect(restoredAllProjects).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Client name' })).toHaveValue(preservedName);
    expect(restoredAllProjects).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: 'Selected projects' }));
    expect(projectOption(await openProjectPicker(user), 'Alpha project')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('checkbox', { name: 'Read users' })).toBeChecked();
    expect(screen.getByLabelText('Expiration date and time')).toHaveValue('2027-12-02T10:15');
  });

  it('submits the validated expansion exactly once after a second save and confirmation', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderEdit();
    await user.click(screen.getByRole('radio', { name: 'All current and future projects' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const warning = screen.getByRole('dialog', { name: 'Include future projects?' });
    const confirm = within(warning).getByRole('button', { name: 'Use all projects' });
    await user.dblClick(confirm);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ expectedVersion: 7, projectAccess: { mode: 'AllProjects' } });
  });

  it('does not confirm persisted-all drafts changed to selected projects', async () => {
    const user = userEvent.setup();
    const allProjectsClient = createClient({ projectAccess: { mode: 'AllProjects' } });
    const { onSubmit } = renderEdit({ client: allProjectsClient });
    await user.click(screen.getByRole('radio', { name: 'Selected projects' }));
    const picker = await openProjectPicker(user);
    await user.click(within(picker).getByText('Beta project'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.queryByRole('dialog', { name: 'Include future projects?' })).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not confirm an edit or renewal that stays selected', async () => {
    const user = userEvent.setup();
    const { onSubmit, unmount } = renderEdit();
    await user.type(screen.getByRole('textbox', { name: 'Client name' }), ' updated');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.queryByRole('dialog', { name: 'Include future projects?' })).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    unmount();
    const { onSubmit: onRenew } = renderEdit({ mode: 'renew', client: createClient({ status: 'Expired' }) });
    await user.type(screen.getByRole('textbox', { name: 'Client name' }), ' renewed');
    await user.click(screen.getByRole('button', { name: 'Renew client' }));
    expect(screen.queryByRole('dialog', { name: 'Include future projects?' })).not.toBeInTheDocument();
    expect(onRenew).toHaveBeenCalledTimes(1);
  });

  it('protects a selected-project renewal only after validation', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderEdit({ mode: 'renew', client: createClient({ status: 'Expired' }) });
    await user.click(screen.getByRole('radio', { name: 'All current and future projects' }));
    await user.click(screen.getByRole('button', { name: 'Renew client' }));
    expect(screen.getByRole('dialog', { name: 'Include future projects?' })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('preserves a selected-project renewal draft through cancellation and submits it once after confirmation', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderEdit({ mode: 'renew', client: createClient({ status: 'Expired' }) });
    const allProjects = screen.getByRole('radio', { name: 'All current and future projects' });

    await user.click(allProjects);
    expect(screen.queryByRole('dialog', { name: 'Include future projects?' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Renew client' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    const restoredAllProjects = screen.getByRole('radio', { name: 'All current and future projects' });
    expect(restoredAllProjects).toBeChecked();
    expect(restoredAllProjects).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Renew client' }));
    const warning = screen.getByRole('dialog', { name: 'Include future projects?' });
    await user.click(within(warning).getByRole('button', { name: 'Use all projects' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ expectedVersion: 7, projectAccess: { mode: 'AllProjects' } });
  });

  it('shows validation errors before opening the expansion confirmation', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderEdit();
    await user.clear(screen.getByRole('textbox', { name: 'Client name' }));
    await user.click(screen.getByRole('radio', { name: 'All current and future projects' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Enter a client name.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Include future projects?' })).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('filters archived ids from an edit draft and submits their removal with an unrelated change', async () => {
    const user = userEvent.setup();
    const archivedProjectId = projects[2].id;
    const { onSubmit } = renderEdit({
      client: createClient({
        projectAccess: { mode: 'SelectedProjects', projectIds: [PROJECT_ONE, archivedProjectId] },
      }),
    });

    const picker = await openProjectPicker(user);
    expect(projectOption(picker, 'Alpha project')).toHaveAttribute('aria-selected', 'true');
    expect(within(picker).queryByText('Archived project')).not.toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Client name' });
    await user.clear(name);
    await user.type(name, 'Repaired client');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledWith({
      expectedVersion: 7,
      name: 'Repaired client',
      projectAccess: { mode: 'SelectedProjects', projectIds: [PROJECT_ONE] },
    });
  });

  it('turns an archived-only edit selection into an explicit validation repair', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderEdit({
      client: createClient({
        projectAccess: { mode: 'SelectedProjects', projectIds: [projects[2].id] },
      }),
    });

    expect(screen.getByRole('radio', { name: 'Selected projects' })).toBeChecked();
    const picker = await openProjectPicker(user);
    expect(projectOption(picker, 'Alpha project')).toHaveAttribute('aria-selected', 'false');
    expect(projectOption(picker, 'Beta project')).toHaveAttribute('aria-selected', 'false');
    const name = screen.getByRole('textbox', { name: 'Client name' });
    await user.clear(name);
    await user.type(name, 'Needs repair');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Select at least one active project.')).toHaveAttribute('role', 'alert');
    expect(onSubmit).not.toHaveBeenCalled();

    const repairedPicker = await openProjectPicker(user);
    await user.click(within(repairedPicker).getByText('Beta project'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).toHaveBeenCalledWith({
      expectedVersion: 7,
      name: 'Needs repair',
      projectAccess: { mode: 'SelectedProjects', projectIds: [PROJECT_TWO] },
    });
  });
});

describe('IntegrationClientFormModal submission and safe errors', () => {
  it('normalizes a synchronous submit failure and releases the pending guard', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => {
      throw Object.assign(new Error('normalized failure'), { kind: 'unexpected', status: null });
    });
    renderCreate({ onSubmit });
    await completeCreateBasics();

    await user.click(screen.getByRole('button', { name: 'Create client' }));

    expect(
      await screen.findByText('The change could not be saved. Your entries are preserved; try again.'),
    ).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('button', { name: 'Create client' })).toBeEnabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits once during a same-turn double click, disables every exit/control while pending, then closes on success', async () => {
    const pending = deferred<void>();
    const onSubmit = vi.fn(() => pending.promise);
    const { onClose } = renderCreate({ onSubmit });
    await completeCreateBasics();
    const submit = screen.getByRole('button', { name: 'Create client' });

    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Client name' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Read projects' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(() => {
      pending.resolve();
      return Promise.resolve();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each<IntegrationClientProblem>([
    { kind: 'timeout', status: null },
    { kind: 'transport', status: null },
    { kind: 'service-unavailable', status: 503 },
    { kind: 'unexpected', status: 500 },
  ])('preserves the entire draft and offers safe retry copy for $kind without replay', async (problem) => {
    const user = userEvent.setup();
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const onSubmit = vi.fn<(arg: unknown) => Promise<void>>(() => Promise.reject(problem));
    const { onClose } = renderCreate({ onSubmit });
    await completeCreateBasics();

    await user.click(screen.getByRole('button', { name: 'Create client' }));

    expect(
      await screen.findByText('The change could not be saved. Your entries are preserved; try again.'),
    ).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('textbox', { name: 'Client name' })).toHaveValue('New app');
    expect(screen.getByRole('checkbox', { name: 'Read projects' })).toBeChecked();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create client' })).toBeEnabled();
  });

  it.each([
    ['name-conflict', 'This client name is already in use.'],
    ['invalid-expiration', 'Choose a valid future expiration.'],
    ['forbidden', 'You do not have permission to change this client.'],
    ['client-not-found', 'This client is no longer available.'],
  ] as const)('maps %s to safe field/status guidance without rendering raw bodies', async (kind, safeMessage) => {
    const user = userEvent.setup();
    const rawBody = 'raw backend internal detail';
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const onSubmit = vi.fn(() => Promise.reject({ kind, status: 400, detail: rawBody }));
    renderCreate({ onSubmit });
    await completeCreateBasics();

    await user.click(screen.getByRole('button', { name: 'Create client' }));

    expect(await screen.findByText(safeMessage)).toHaveAttribute('role', 'alert');
    expect(screen.queryByText(rawBody)).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['forbidden', 403, 'You do not have permission to change this client.'],
    ['client-not-found', 404, 'This client is no longer available.'],
  ] as const)(
    'keeps terminal %s guidance non-retryable while allowing deliberate dismissal',
    async (kind, status, message) => {
      const user = userEvent.setup();
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      const onSubmit = vi.fn<(arg: unknown) => Promise<void>>(() => Promise.reject({ kind, status }));
      const { onClose } = renderEdit({ onSubmit });
      const name = screen.getByRole('textbox', { name: 'Client name' });
      await user.clear(name);
      await user.type(name, 'Terminal update');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      const terminalError = await screen.findByText(message);
      const submit = screen.getByRole('button', { name: 'Save changes' });
      expect(terminalError).toHaveAttribute('role', 'alert');
      expect(submit).toBeDisabled();
      expect(submit).toHaveAttribute('aria-describedby', expect.stringContaining(terminalError.id));
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

      await user.type(name, ' remains blocked');
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(submit).toBeDisabled();
      expect(onSubmit).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    },
  );

  it('associates invalid-policy guidance with both policy groups and focuses a deterministic policy control', async () => {
    const user = userEvent.setup();
    const rawBody = 'raw backend policy detail';
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const onSubmit = vi.fn(() => Promise.reject({ kind: 'invalid-policy', status: 400, detail: rawBody }));
    renderEdit({ onSubmit });
    const name = screen.getByRole('textbox', { name: 'Client name' });
    await user.clear(name);
    await user.type(name, 'Policy change');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const policyError = await screen.findByText('Review permissions and project access.');
    const permissions = screen.getByRole('group', { name: 'Permissions' });
    const projectsGroup = screen.getByRole('group', { name: 'Project access' });
    expect(policyError).toHaveAttribute('role', 'alert');
    expect(permissions).toHaveAttribute('aria-describedby', expect.stringContaining(policyError.id));
    expect(projectsGroup).toHaveAttribute('aria-describedby', expect.stringContaining(policyError.id));
    expect(within(permissions).getAllByRole('checkbox')[0]).toHaveFocus();
    expect(screen.queryByText(rawBody)).not.toBeInTheDocument();
  });

  it('preserves a stale draft and refreshes deliberately exactly once without replaying the mutation', async () => {
    const user = userEvent.setup();
    const refreshed = createClient({ name: 'Server name', version: 8, scopes: ['users:read'] });
    const onSubmit = vi.fn(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject({ kind: 'stale-version', status: 409, currentVersion: 8 } satisfies IntegrationClientProblem),
    );
    const onRefresh = vi.fn(() => Promise.resolve(refreshed));
    renderEdit({ onRefresh, onSubmit });
    const name = screen.getByRole('textbox', { name: 'Client name' });
    await user.clear(name);
    await user.type(name, 'My unsaved name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const staleMessage = 'This client changed elsewhere (current version: 8). Refresh before retrying.';
    expect(await screen.findByText(staleMessage)).toHaveAttribute('role', 'alert');
    expect(name).toHaveValue('My unsaved name');
    expect(onRefresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Refresh client' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('textbox', { name: 'Client name' })).toHaveValue('Server name');
    expect(screen.getByRole('checkbox', { name: 'Read users' })).toBeChecked();
    expect(screen.queryByText(staleMessage)).not.toBeInTheDocument();
  });

  it('uses natural stale guidance when the current version is unavailable', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject({ kind: 'stale-version', status: 409, currentVersion: null } satisfies IntegrationClientProblem),
    );
    renderEdit({ onSubmit });
    const name = screen.getByRole('textbox', { name: 'Client name' });
    await user.clear(name);
    await user.type(name, 'Stale name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(
        'This client changed elsewhere, but its current version is unavailable. Refresh before retrying.',
      ),
    ).toHaveAttribute('role', 'alert');
    expect(screen.queryByText(/current version:\s*\)/i)).not.toBeInTheDocument();
  });

  it('retains stale guidance and requires refresh across every draft edit and project confirmation', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject({ kind: 'stale-version', status: 409, currentVersion: 8 } satisfies IntegrationClientProblem),
    );
    renderEdit({ onSubmit });
    const name = screen.getByRole('textbox', { name: 'Client name' });
    await user.clear(name);
    await user.type(name, 'First stale edit');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const staleMessage = 'This client changed elsewhere (current version: 8). Refresh before retrying.';
    expect(await screen.findByText(staleMessage)).toBeInTheDocument();

    await user.type(name, ' retained');
    expect(screen.getByText(staleMessage)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Read users' }));
    expect(screen.getByText(staleMessage)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'No expiration' }));
    expect(screen.getByText(staleMessage)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'All current and future projects' }));
    expect(screen.queryByRole('dialog', { name: 'Include future projects?' })).not.toBeInTheDocument();
    expect(screen.getByText(staleMessage)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh client' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('filters unavailable project ids when a deliberate refresh replaces the draft', async () => {
    const user = userEvent.setup();
    const refreshed = createClient({
      name: 'Refreshed policy',
      version: 8,
      projectAccess: { mode: 'SelectedProjects', projectIds: [PROJECT_TWO, projects[2].id] },
    });
    const onSubmit = vi
      .fn<(arg: unknown) => Promise<void>>()
      .mockRejectedValueOnce({
        kind: 'stale-version',
        status: 409,
        currentVersion: 8,
      } satisfies IntegrationClientProblem)
      .mockResolvedValueOnce();
    const onRefresh = vi.fn(() => Promise.resolve(refreshed));
    renderEdit({ onRefresh, onSubmit });
    const name = screen.getByRole('textbox', { name: 'Client name' });
    await user.clear(name);
    await user.type(name, 'Unsaved');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(await screen.findByRole('button', { name: 'Refresh client' }));

    expect(await screen.findByRole('textbox', { name: 'Client name' })).toHaveValue('Refreshed policy');
    const picker = await openProjectPicker(user);
    expect(projectOption(picker, 'Beta project')).toHaveAttribute('aria-selected', 'true');
    expect(within(picker).queryByText('Archived project')).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Client name' }), ' repaired');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      expectedVersion: 8,
      name: 'Refreshed policy repaired',
      projectAccess: { mode: 'SelectedProjects', projectIds: [PROJECT_TWO] },
    });
  });

  it('keeps the draft and shows safe guidance when explicit refresh fails', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject({ kind: 'stale-version', status: 409, currentVersion: 8 } satisfies IntegrationClientProblem),
    );
    const onRefresh = vi.fn(() => Promise.reject(new Error('raw refresh failure')));
    renderEdit({ onRefresh, onSubmit });
    const name = screen.getByRole('textbox', { name: 'Client name' });
    await user.clear(name);
    await user.type(name, 'My unsaved name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(await screen.findByRole('button', { name: 'Refresh client' }));

    expect(
      await screen.findByText('The latest client could not be loaded. Your entries are preserved.'),
    ).toHaveAttribute('role', 'alert');
    expect(
      screen.getByText('This client changed elsewhere (current version: 8). Refresh before retrying.'),
    ).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('textbox', { name: 'Client name' })).toHaveValue('My unsaved name');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Refresh client' })).toBeEnabled();
  });

  it('assimilates a synchronous refresh throw, preserves the draft, and remains retryable', async () => {
    const user = userEvent.setup();
    const refreshed = createClient({ name: 'Recovered server name', version: 8 });
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const onSubmit = vi.fn(() => Promise.reject({ kind: 'not-active', status: 409 }));
    const onRefresh = vi
      .fn<() => Promise<IntegrationClient>>()
      .mockImplementationOnce(() => {
        throw new Error('synchronous raw refresh failure');
      })
      .mockResolvedValueOnce(refreshed);
    renderEdit({ onRefresh, onSubmit });
    const name = screen.getByRole('textbox', { name: 'Client name' });
    await user.clear(name);
    await user.type(name, 'My preserved name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(await screen.findByRole('button', { name: 'Refresh client' }));

    expect(
      await screen.findByText('The latest client could not be loaded. Your entries are preserved.'),
    ).toHaveAttribute('role', 'alert');
    expect(name).toHaveValue('My preserved name');
    expect(screen.getByRole('button', { name: 'Refresh client' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Refresh client' }));
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('textbox', { name: 'Client name' })).toHaveValue('Recovered server name');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('guards a same-turn double refresh and never replays the mutation', async () => {
    const user = userEvent.setup();
    const pending = deferred<IntegrationClient>();
    const onSubmit = vi.fn(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject({ kind: 'stale-version', status: 409, currentVersion: 8 } satisfies IntegrationClientProblem),
    );
    const onRefresh = vi.fn(() => pending.promise);
    renderEdit({ onRefresh, onSubmit });
    const name = screen.getByRole('textbox', { name: 'Client name' });
    await user.clear(name);
    await user.type(name, 'Stale edit');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const refresh = await screen.findByRole('button', { name: 'Refresh client' });

    fireEvent.click(refresh);
    fireEvent.click(refresh);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(refresh).toBeDisabled();

    await act(() => {
      pending.resolve(createClient({ name: 'Current server name', version: 8 }));
      return Promise.resolve();
    });
    expect(await screen.findByRole('textbox', { name: 'Client name' })).toHaveValue('Current server name');
  });
});
