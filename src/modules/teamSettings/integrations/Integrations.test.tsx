const demoMode = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/core/config/demo', () => ({
  get isDemo() {
    return demoMode.enabled;
  },
}));
beforeEach(() => {
  demoMode.enabled = false;
});
import * as integrationClientRequests from '@/modules/integrationClients/requests';
import type {
  CreateIntegrationClientInput,
  IntegrationClient,
  IntegrationClientAuditEvent,
  UpdateIntegrationClientInput,
} from '@/modules/integrationClients/types';
import { useSyncExternalStore } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock, Mocked } from 'vitest';
import { ZodError } from 'zod';
import IntegrationClientsTable from './IntegrationClientsTable';
import Integrations from './Integrations';

const providerMocks = vi.hoisted(() => ({ projects: vi.fn(), workspace: vi.fn() }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: providerMocks.workspace }));
vi.mock('@/modules/projects/ProjectsProvider', () => ({ useProjects: providerMocks.projects }));
vi.mock('@/modules/integrationClients/requests');

// IntegrationClientFormModal and IntegrationClientDetailsModal each have their own dedicated test
// file (IntegrationClientFormModal.test.tsx, IntegrationClientDetailsModal.test.tsx) covering their
// internal rendering/validation -- this file mocks them down to their props so orchestration tests
// here exercise what Integrations.tsx itself is responsible for (which hook gets called with what,
// selection/focus/notice state) without re-driving their full internal UI. IntegrationClientsTable
// has no dedicated test file (its own describe block below covers it) and IntegrationClientConfirmationModal
// has no dedicated test file either, so both stay real here.
interface FormModalProps {
  client?: IntegrationClient;
  mode: 'create' | 'edit' | 'renew';
  onClose: () => void;
  onRefresh?: () => Promise<IntegrationClient>;
  onSubmit: (input: CreateIntegrationClientInput | UpdateIntegrationClientInput) => Promise<void>;
}
const formModalPropsRef: { current: FormModalProps | null } = { current: null };
vi.mock('./IntegrationClientFormModal', () => ({
  __esModule: true,
  default: (props: FormModalProps) => {
    formModalPropsRef.current = props;
    return <div data-testid={`form-modal-${props.mode}`} />;
  },
}));

interface DetailsModalProps {
  auditEvents: readonly IntegrationClientAuditEvent[];
  auditHasNextPage: boolean;
  auditState: 'idle' | 'loading' | 'success' | 'error';
  client: IntegrationClient | null;
  detailState: 'idle' | 'loading' | 'success' | 'error';
  isDetailFresh: boolean;
  onClose: () => void;
  onLoadMoreAudit: () => void;
  onRetryAudit: () => void;
  onRetryDetails: () => void;
}
const detailsModalPropsRef: { current: DetailsModalProps | null } = { current: null };
vi.mock('./IntegrationClientDetailsModal', () => ({
  __esModule: true,
  default: (props: DetailsModalProps) => {
    detailsModalPropsRef.current = props;
    return <div data-testid="details-modal" />;
  },
}));

const mockOneTimeCredentialsRender = vi.fn();
vi.mock('./OneTimeCredentialsModal', async () => {
  const actual = await vi.importActual<typeof import('./OneTimeCredentialsModal')>('./OneTimeCredentialsModal');
  const react = await vi.importActual<typeof import('react')>('react');

  return {
    __esModule: true,
    ...actual,
    default: (props: {
      credentials: { clientId: string; clientSecret: string };
      isOpen: boolean;
      onDone: () => void;
    }) => {
      mockOneTimeCredentialsRender(props.credentials);
      return react.createElement(actual.default, props);
    },
  };
});

let mockActiveLocale = 'en-GB';
const mockMessages: Record<string, string> = {
  'team_seatings.integrations.heading': 'Integration clients',
  'team_seatings.integrations.description':
    'Manage OAuth clients that connect external applications to your organization.',
  'team_seatings.integrations.loading': 'Loading integration clients…',
  'team_seatings.integrations.empty.heading': 'No integration clients yet',
  'team_seatings.integrations.empty.description': 'Create an integration client to connect an external application.',
  'team_seatings.integrations.error.heading': 'Integration clients could not be loaded',
  'team_seatings.integrations.error.description': 'Try loading the integration clients again.',
  'team_seatings.integrations.error.validation.description':
    "We received data we couldn't verify. Please try again or contact support if this keeps happening.",
  'team_seatings.integrations.retry': 'Retry',
  'team_seatings.integrations.count': '{{count}} integration clients',
  'team_seatings.integrations.load_more': 'Load more',
  'team_seatings.integrations.loading_more': 'Loading more integration clients…',
  'team_seatings.integrations.column.client': 'Client',
  'team_seatings.integrations.column.status': 'Status',
  'team_seatings.integrations.column.expires': 'Expires',
  'team_seatings.integrations.column.last_used': 'Last used',
  'team_seatings.integrations.column.actions': 'Actions',
  'team_seatings.integrations.status.Active': 'Active',
  'team_seatings.integrations.status.Expired': 'Expired',
  'team_seatings.integrations.status.Revoked': 'Revoked',
  'team_seatings.integrations.no_expiration': 'No expiration',
  'team_seatings.integrations.never_used': 'Never used',
  'team_seatings.integrations.date_unavailable': 'Unavailable',
  'team_seatings.integrations.action.details': 'Details',
  'team_seatings.integrations.action.edit': 'Edit',
  'team_seatings.integrations.action.rotate': 'Rotate',
  'team_seatings.integrations.action.revoke': 'Revoke',
  'team_seatings.integrations.action.renew': 'Renew',
  'team_seatings.integrations.action.add': '+ Add client',
  'team_seatings.integrations.lifecycle.rotate.title': 'Rotate client secret?',
  'team_seatings.integrations.lifecycle.rotate.text':
    'The previous secret will stop issuing tokens. Existing tokens can work for up to five minutes.',
  'team_seatings.integrations.lifecycle.rotate.confirm': 'Rotate secret now',
  'team_seatings.integrations.lifecycle.revoke.title': 'Revoke integration client?',
  'team_seatings.integrations.lifecycle.revoke.text': 'This cannot be undone. Tokens will stop working immediately.',
  'team_seatings.integrations.lifecycle.revoke.confirm': 'Revoke client now',
  'team_seatings.integrations.lifecycle.error.stale-version.with-version':
    'This client changed elsewhere (current version: {currentVersion}). Refresh before retrying.',
  'team_seatings.integrations.lifecycle.error.stale-version.without-version':
    'This client changed elsewhere. Refresh before retrying.',
  'team_seatings.integrations.lifecycle.error.forbidden': 'You do not have permission to change this client.',
  'team_seatings.integrations.lifecycle.error.retry': 'The change failed. Review and try again.',
  'team_seatings.integrations.lifecycle.refresh': 'Refresh client',
  'team_seatings.integrations.lifecycle.notice.not_found': 'This integration client is no longer available.',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: mockActiveLocale, resolvedLanguage: mockActiveLocale },
    t: (key: string, values?: Record<string, string | number>) =>
      (mockMessages[key] ?? key)
        .replace('{{count}}', String(values?.count ?? ''))
        .replace('{currentVersion}', String(values?.currentVersion ?? '')),
  }),
}));

const requestsMock = integrationClientRequests as Mocked<typeof integrationClientRequests>;
const ACTOR = { userId: '33333333-3333-4333-8333-333333333333', displayName: 'Client owner' };
const INSTANT = '2026-01-02T03:04:05Z';

const createClient = (clientId: string, overrides: Partial<IntegrationClient> = {}): IntegrationClient => ({
  clientId,
  name: `Client ${clientId}`,
  status: 'Active',
  scopes: ['projects:read'],
  projectAccess: { mode: 'AllProjects' },
  version: 1,
  policyVersion: 1,
  secretVersion: 1,
  serviceAccount: ACTOR,
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: ACTOR,
  modifiedAt: '2026-01-01T00:00:00Z',
  modifiedBy: ACTOR,
  secretRotatedAt: '2026-01-01T00:00:00Z',
  secretRotatedBy: ACTOR,
  expiresAt: null,
  revokedAt: null,
  revokedBy: null,
  lastUsedAt: null,
  ...overrides,
});

const createAuditEvent = (
  id: string,
  overrides: Partial<IntegrationClientAuditEvent> = {},
): IntegrationClientAuditEvent => ({
  id,
  occurredAt: '2026-01-02T03:04:05Z',
  actorType: 'Human',
  actorUserId: ACTOR.userId,
  actor: ACTOR,
  eventType: 'Create',
  outcome: 'Success',
  metadata: { version: 1 },
  ...overrides,
});

const axiosProblem = (status: number, type?: string, extra: Record<string, unknown> = {}): unknown => ({
  isAxiosError: true,
  name: 'AxiosError',
  message: 'Request failed',
  response: { status, data: { ...(type ? { type } : {}), ...extra } },
});

interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
}
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

interface ProjectsContextFixture {
  fetchProjects: Mock<() => Promise<void>>;
  filteredOrganizationProjects: Array<{ archived?: boolean; id: string; name: string }>;
  isOrganizationProjectsCatalogReady?: boolean;
  organizationProjectsCatalogState?: 'error' | 'idle' | 'loading' | 'ready';
}

interface ExternalStore<T> {
  getSnapshot: () => T;
  setState: (nextState: T) => void;
  subscribe: (listener: () => void) => () => boolean;
}

const createExternalStore = <T,>(initialState: T): ExternalStore<T> => {
  let state = initialState;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    setState: (nextState: T) => {
      state = nextState;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const renderIntegrations = (
  options: {
    organizationSlug?: string;
    projectsContext?: Partial<ProjectsContextFixture>;
    staleTime?: number;
  } = {},
): ReturnType<typeof render> & {
  workspaceContext: { contextOrganizationSlug: string };
  projectsContext: ProjectsContextFixture;
  queryClient: QueryClient;
} => {
  const contextState = createExternalStore({ contextOrganizationSlug: options.organizationSlug ?? 'acme' });
  const workspaceContext = {
    get contextOrganizationSlug() {
      return contextState.getSnapshot().contextOrganizationSlug;
    },
    set contextOrganizationSlug(value: string) {
      contextState.setState({ contextOrganizationSlug: value });
    },
  };
  const projectsContext: ProjectsContextFixture = {
    fetchProjects: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    filteredOrganizationProjects: [],
    isOrganizationProjectsCatalogReady: true,
    organizationProjectsCatalogState: 'ready',
    ...options.projectsContext,
  };
  providerMocks.workspace.mockImplementation(() => {
    useSyncExternalStore(contextState.subscribe, contextState.getSnapshot);
    return workspaceContext;
  });
  providerMocks.projects.mockReturnValue(projectsContext);
  // staleTime defaults to 0 (TanStack's own default), NOT the production QueryClient's 60s default
  // (src/core/api/queryClient.ts) -- tests that need to exercise "cached but still within staleTime"
  // behavior (e.g. a conflict-resolution refetch) must opt in via this option.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: options.staleTime ?? 0 } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Integrations />
    </QueryClientProvider>,
  );
  return { ...view, workspaceContext, projectsContext, queryClient };
};

beforeEach(() => {
  vi.clearAllMocks();
  formModalPropsRef.current = null;
  detailsModalPropsRef.current = null;
  requestsMock.listIntegrationClients.mockResolvedValue({ count: 0, results: [] });
  requestsMock.getIntegrationClient.mockResolvedValue(createClient('unused'));
  requestsMock.listIntegrationClientAuditEvents.mockResolvedValue({ count: 0, results: [] });
});

describe('Integrations list loading', () => {
  it('loads the first client page and current projects on mount and shows the initial loading state', async () => {
    const client = createClient('client-1');
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    const { projectsContext } = renderIntegrations();

    expect(screen.getByRole('status')).toHaveTextContent('Loading integration clients…');
    expect(await screen.findByRole('table', { name: 'Integration clients' })).toBeInTheDocument();
    expect(requestsMock.listIntegrationClients).toHaveBeenCalledWith('acme', { pageSize: 20, pageNumber: 1 });
    expect(projectsContext.fetchProjects).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable error state and recovers on retry', async () => {
    requestsMock.listIntegrationClients
      .mockRejectedValueOnce(axiosProblem(503, 'result:error:service-unavailable'))
      .mockResolvedValueOnce({ count: 1, results: [createClient('client-1')] });
    const user = userEvent.setup();
    renderIntegrations();

    expect(await screen.findByRole('alert')).toHaveTextContent('Integration clients could not be loaded');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('table', { name: 'Integration clients' })).toBeInTheDocument();
    expect(requestsMock.listIntegrationClients).toHaveBeenCalledTimes(2);
  });

  it('shows a distinct, non-network error message when the page fails response validation', async () => {
    requestsMock.listIntegrationClients.mockRejectedValueOnce(
      new ZodError([
        { code: 'invalid_type', expected: 'number', received: 'undefined', path: ['count'], message: 'Required' },
      ]),
    );
    renderIntegrations();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We received data we couldn't verify. Please try again or contact support if this keeps happening.",
    );
    // Still a retryable state -- retrying is reasonable even for a validation failure (e.g. the
    // underlying bad record could since have been fixed server-side).
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders the empty state after a successful empty response', async () => {
    renderIntegrations();

    expect(await screen.findByText('No integration clients yet')).toBeInTheDocument();
  });

  it('loads only the next page and merges it with the currently visible rows', async () => {
    const first = createClient('client-1');
    const second = createClient('client-2');
    requestsMock.listIntegrationClients
      .mockResolvedValueOnce({ count: 2, results: [first] })
      .mockResolvedValueOnce({ count: 2, results: [second] });
    const user = userEvent.setup();
    renderIntegrations();

    expect(await screen.findByText('Client client-1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Client client-2')).toBeInTheDocument();
    expect(screen.getByText('Client client-1')).toBeInTheDocument();
    expect(requestsMock.listIntegrationClients).toHaveBeenNthCalledWith(2, 'acme', { pageSize: 20, pageNumber: 2 });
  });

  it('keeps the count and the Load-more button visible while the next page is still loading', async () => {
    const secondPage = deferred<Awaited<ReturnType<typeof integrationClientRequests.listIntegrationClients>>>();
    requestsMock.listIntegrationClients
      .mockResolvedValueOnce({ count: 2, results: [createClient('client-1')] })
      .mockReturnValueOnce(secondPage.promise);
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');
    expect(screen.getByText('2 integration clients')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    // Regresses to "0 integration clients" and the button unmounting entirely (hasMore derives from
    // count) if count is read from the newest page's own (still in-flight) data instead of the most
    // recently loaded page that actually has data.
    expect(screen.getByText('2 integration clients')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loading more integration clients…' })).toBeInTheDocument();

    secondPage.resolve({ count: 2, results: [createClient('client-2')] });
    expect(await screen.findByText('Client client-2')).toBeInTheDocument();
  });

  it('resets accumulated pages on an organization switch instead of firing one request per previously-loaded page', async () => {
    requestsMock.listIntegrationClients
      .mockResolvedValueOnce({ count: 2, results: [createClient('old-client-1')] })
      .mockResolvedValueOnce({ count: 2, results: [createClient('old-client-2')] })
      .mockResolvedValueOnce({ count: 1, results: [createClient('new-client-1')] });
    const user = userEvent.setup();
    const { workspaceContext } = renderIntegrations({ organizationSlug: 'old-org' });
    await screen.findByText('Client old-client-1');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Client old-client-2');

    act(() => {
      (() => {
        workspaceContext.contextOrganizationSlug = 'new-org';
      })();
    });

    expect(await screen.findByText('Client new-client-1')).toBeInTheDocument();
    // Without resetting the accumulated page count, switching organizations after loading 2 pages
    // fires 2 parallel requests for the new organization (one of which likely doesn't exist there)
    // instead of just page 1 -- a 4th call here means that burst happened.
    expect(requestsMock.listIntegrationClients).toHaveBeenCalledTimes(3);
    expect(requestsMock.listIntegrationClients).toHaveBeenNthCalledWith(3, 'new-org', { pageSize: 20, pageNumber: 1 });
  });

  it('refetches under the new organization and discards a late response from the previous one', async () => {
    const oldOrgResponse = deferred<Awaited<ReturnType<typeof integrationClientRequests.listIntegrationClients>>>();
    requestsMock.listIntegrationClients.mockReturnValueOnce(oldOrgResponse.promise).mockResolvedValueOnce({
      count: 1,
      results: [createClient('new-org-client')],
    });
    const { workspaceContext } = renderIntegrations({ organizationSlug: 'old-org' });

    act(() => {
      (() => {
        workspaceContext.contextOrganizationSlug = 'new-org';
      })();
    });

    expect(await screen.findByText('Client new-org-client')).toBeInTheDocument();
    oldOrgResponse.resolve({ count: 1, results: [createClient('old-org-client')] });
    await Promise.resolve();

    expect(screen.queryByText('Client old-org-client')).not.toBeInTheDocument();
    expect(screen.getByText('Client new-org-client')).toBeInTheDocument();
  });
});

describe('Integrations create flow', () => {
  it('creates once and shows the returned one-time credentials, closing the create form', async () => {
    const created = createClient('created-client');
    requestsMock.createIntegrationClient.mockResolvedValueOnce({ client: created, clientSecret: 'created-secret' });
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('No integration clients yet');

    await user.click(screen.getByRole('button', { name: '+ Add client' }));
    expect(await screen.findByTestId('form-modal-create')).toBeInTheDocument();

    const input: CreateIntegrationClientInput = {
      name: 'New client',
      scopes: ['projects:read'],
      projectAccess: { mode: 'AllProjects' },
    };
    await act(() => formModalPropsRef.current!.onSubmit(input));

    expect(requestsMock.createIntegrationClient).toHaveBeenCalledWith('acme', input);
    await waitFor(() =>
      expect(mockOneTimeCredentialsRender).toHaveBeenCalledWith({
        clientId: 'created-client',
        clientSecret: 'created-secret',
      }),
    );
    expect(screen.queryByTestId('form-modal-create')).not.toBeInTheDocument();
  });

  it('discards a late create response after an organization switch without showing credentials', async () => {
    const response = deferred<Awaited<ReturnType<typeof integrationClientRequests.createIntegrationClient>>>();
    requestsMock.createIntegrationClient.mockReturnValueOnce(response.promise);
    const user = userEvent.setup();
    const { workspaceContext } = renderIntegrations({ organizationSlug: 'old-org' });
    await screen.findByText('No integration clients yet');
    await user.click(screen.getByRole('button', { name: '+ Add client' }));
    await screen.findByTestId('form-modal-create');

    const submission = act(() =>
      formModalPropsRef.current!.onSubmit({
        name: 'New client',
        scopes: ['projects:read'],
        projectAccess: { mode: 'AllProjects' },
      }),
    );
    (() => {
      workspaceContext.contextOrganizationSlug = 'new-org';
    })();
    response.resolve({ client: createClient('created-client'), clientSecret: 'created-secret' });
    await submission;

    expect(mockOneTimeCredentialsRender).not.toHaveBeenCalled();
  });
});

describe('Integrations edit and renew orchestration', () => {
  it('opens an active client in edit mode and submits through the update mutation', async () => {
    const client = createClient('client-1', { status: 'Active' });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    const updated = createClient('client-1', { name: 'Updated', version: 2 });
    requestsMock.updateIntegrationClient.mockResolvedValueOnce(updated);
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Edit: Client client-1' }));
    expect(await screen.findByTestId('form-modal-edit')).toBeInTheDocument();

    const input: UpdateIntegrationClientInput = { expectedVersion: 1, name: 'Updated' };
    await act(() => formModalPropsRef.current!.onSubmit(input));

    expect(requestsMock.updateIntegrationClient).toHaveBeenCalledWith('acme', 'client-1', input);
  });

  it('opens an expired client in renew mode', async () => {
    const client = createClient('client-1', { status: 'Expired' });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Renew: Client client-1' }));
    expect(await screen.findByTestId('form-modal-renew')).toBeInTheDocument();
  });

  it('does not expose edit or renew for revoked clients', async () => {
    const client = createClient('client-1', { status: 'Revoked' });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    renderIntegrations();

    await screen.findByText('Client client-1');
    expect(screen.queryByRole('button', { name: /^Edit:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Renew:/ })).not.toBeInTheDocument();
  });

  it('refreshes a stale client on demand through the details query cache and reconciles the form mode', async () => {
    const client = createClient('client-1', { status: 'Active', version: 1 });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    const refreshed = createClient('client-1', { status: 'Expired', version: 2 });
    requestsMock.getIntegrationClient.mockResolvedValueOnce(refreshed);
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');
    await user.click(screen.getByRole('button', { name: 'Edit: Client client-1' }));
    await screen.findByTestId('form-modal-edit');

    const result = await act(() => formModalPropsRef.current!.onRefresh!());

    expect(result).toEqual(refreshed);
    expect(requestsMock.getIntegrationClient).toHaveBeenCalledWith('acme', 'client-1');
    await waitFor(() => expect(formModalPropsRef.current?.mode).toBe('renew'));
  });

  it('forces a network read when refreshing, even when the details cache is still within staleTime, and syncs the list row', async () => {
    const client = createClient('client-1', { status: 'Active', version: 1 });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.getIntegrationClient
      // Primes the detail query cache -- this response would still be "fresh" under the
      // production-like 60s staleTime used below, so a naive fetchQuery would short-circuit to it.
      .mockResolvedValueOnce(createClient('client-1', { status: 'Active', version: 1 }))
      .mockResolvedValueOnce(createClient('client-1', { status: 'Expired', version: 2 }));
    const user = userEvent.setup();
    const { queryClient } = renderIntegrations({ staleTime: 60_000 });
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Details: Client client-1' }));
    await screen.findByTestId('details-modal');
    await waitFor(() => expect(requestsMock.getIntegrationClient).toHaveBeenCalledTimes(1));
    act(() => detailsModalPropsRef.current!.onClose());

    await user.click(screen.getByRole('button', { name: 'Edit: Client client-1' }));
    await screen.findByTestId('form-modal-edit');

    const result = await act(() => formModalPropsRef.current!.onRefresh!());

    expect(requestsMock.getIntegrationClient).toHaveBeenCalledTimes(2);
    expect(result.version).toBe(2);

    const listCacheEntries = queryClient.getQueriesData<{ results: IntegrationClient[] }>({
      queryKey: ['integrationClients', 'acme'],
    });
    const listedClient = listCacheEntries
      .flatMap(([, data]) => data?.results ?? [])
      .find((listed) => listed.clientId === 'client-1');
    expect(listedClient?.version).toBe(2);
    expect(listedClient?.status).toBe('Expired');
  });

  it('evicts the client from the list cache when the edit-form refresh finds it already deleted', async () => {
    const client = createClient('client-1', { status: 'Active', version: 1 });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.getIntegrationClient.mockRejectedValueOnce(axiosProblem(404, 'result:oauth-client:client-not-found'));
    const user = userEvent.setup();
    const { queryClient } = renderIntegrations();
    await screen.findByText('Client client-1');
    await user.click(screen.getByRole('button', { name: 'Edit: Client client-1' }));
    await screen.findByTestId('form-modal-edit');

    let caughtError: unknown;
    await act(async () => {
      try {
        await formModalPropsRef.current!.onRefresh!();
      } catch (error) {
        caughtError = error;
      }
    });

    expect(caughtError).toMatchObject({ kind: 'client-not-found' });
    // Every other not-found path in this module evicts the client from cached list pages; a
    // conflict-resolution refresh from the edit form must too, or the row stays visible and
    // clickable in the table after the client is confirmed gone.
    const listedClient = queryClient
      .getQueriesData<{ results: IntegrationClient[] }>({ queryKey: ['integrationClients', 'acme'] })
      .flatMap(([, data]) => data?.results ?? [])
      .find((listed) => listed.clientId === 'client-1');
    expect(listedClient).toBeUndefined();
  });

  it('closes the local form selection when the organization changes', async () => {
    const client = createClient('client-1');
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    const user = userEvent.setup();
    const { workspaceContext } = renderIntegrations({ organizationSlug: 'old-org' });
    await screen.findByText('Client client-1');
    await user.click(screen.getByRole('button', { name: 'Edit: Client client-1' }));
    await screen.findByTestId('form-modal-edit');

    act(() => {
      (() => {
        workspaceContext.contextOrganizationSlug = 'new-org';
      })();
    });

    await waitFor(() => expect(screen.queryByTestId('form-modal-edit')).not.toBeInTheDocument());
  });
});

describe('Integrations details and audit orchestration', () => {
  it('opens row details, loads audit history, and paginates it', async () => {
    const client = createClient('client-1');
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.getIntegrationClient.mockResolvedValueOnce(client);
    const first = createAuditEvent('event-1');
    const second = createAuditEvent('event-2');
    requestsMock.listIntegrationClientAuditEvents
      .mockResolvedValueOnce({ count: 2, results: [first] })
      .mockResolvedValueOnce({ count: 2, results: [second] });
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Details: Client client-1' }));
    await screen.findByTestId('details-modal');

    await waitFor(() => expect(detailsModalPropsRef.current?.client).toEqual(client));
    await waitFor(() => expect(detailsModalPropsRef.current?.auditEvents).toEqual([first]));

    act(() => {
      detailsModalPropsRef.current!.onLoadMoreAudit();
    });

    await waitFor(() => expect(detailsModalPropsRef.current?.auditEvents).toEqual([first, second]));
  });

  it('keeps auditHasNextPage true while the next audit page is still loading', async () => {
    const client = createClient('client-1');
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.getIntegrationClient.mockResolvedValueOnce(client);
    const secondAuditPage =
      deferred<Awaited<ReturnType<typeof integrationClientRequests.listIntegrationClientAuditEvents>>>();
    requestsMock.listIntegrationClientAuditEvents
      .mockResolvedValueOnce({ count: 2, results: [createAuditEvent('event-1')] })
      .mockReturnValueOnce(secondAuditPage.promise);
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Details: Client client-1' }));
    await waitFor(() => expect(detailsModalPropsRef.current?.auditHasNextPage).toBe(true));

    act(() => detailsModalPropsRef.current!.onLoadMoreAudit());

    // The same count-reads-0-while-in-flight bug as the client list would flip this false and hide
    // the "load more" control mid-fetch.
    expect(detailsModalPropsRef.current?.auditHasNextPage).toBe(true);

    secondAuditPage.resolve({ count: 2, results: [createAuditEvent('event-2')] });
    await waitFor(() =>
      expect(detailsModalPropsRef.current?.auditEvents.map((event) => event.id)).toEqual(['event-1', 'event-2']),
    );
  });

  it('does not mark details fresh from cached data until a real network read for this reopen completes', async () => {
    const client = createClient('client-1', { status: 'Active', version: 1 });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    const secondRead = deferred<IntegrationClient>();
    requestsMock.getIntegrationClient
      // First open primes the detail cache -- under a production-like 60s staleTime, a naive
      // isDetailFresh (isSuccess alone) would treat that cached value as fresh on reopen with no
      // second network read at all.
      .mockResolvedValueOnce(client)
      .mockReturnValueOnce(secondRead.promise);
    const user = userEvent.setup();
    renderIntegrations({ staleTime: 60_000 });
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Details: Client client-1' }));
    await waitFor(() => expect(requestsMock.getIntegrationClient).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(detailsModalPropsRef.current?.isDetailFresh).toBe(true));
    act(() => detailsModalPropsRef.current!.onClose());

    await user.click(screen.getByRole('button', { name: 'Details: Client client-1' }));

    await waitFor(() => expect(requestsMock.getIntegrationClient).toHaveBeenCalledTimes(2));
    expect(detailsModalPropsRef.current?.isDetailFresh).toBe(false);

    secondRead.resolve(createClient('client-1', { status: 'Active', version: 1 }));
    await waitFor(() => expect(detailsModalPropsRef.current?.isDetailFresh).toBe(true));
  });

  it('closes stale details and shows a safe list notice after a client-not-found detail response', async () => {
    const client = createClient('client-1');
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.getIntegrationClient.mockRejectedValueOnce(axiosProblem(404, 'result:oauth-client:client-not-found'));
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Details: Client client-1' }));

    expect(await screen.findByText('This integration client is no longer available.')).toBeInTheDocument();
    expect(screen.queryByTestId('details-modal')).not.toBeInTheDocument();
  });

  it('retries details and audit through the query cache', async () => {
    const client = createClient('client-1');
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.getIntegrationClient.mockResolvedValueOnce(client);
    requestsMock.listIntegrationClientAuditEvents.mockResolvedValueOnce({ count: 0, results: [] });
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');
    await user.click(screen.getByRole('button', { name: 'Details: Client client-1' }));
    await screen.findByTestId('details-modal');
    await waitFor(() => expect(requestsMock.getIntegrationClient).toHaveBeenCalledTimes(1));

    act(() => {
      detailsModalPropsRef.current!.onRetryDetails();
      detailsModalPropsRef.current!.onRetryAudit();
    });

    await waitFor(() => expect(requestsMock.getIntegrationClient).toHaveBeenCalledTimes(2));
    expect(requestsMock.listIntegrationClientAuditEvents.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Integrations lifecycle orchestration', () => {
  it('rotates once with the current version and shows the returned one-time credentials', async () => {
    const client = createClient('client-1', { status: 'Active', version: 3 });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.rotateIntegrationClientSecret.mockResolvedValueOnce({
      client: createClient('client-1', { secretVersion: 2, version: 4 }),
      clientSecret: 'rotated-secret',
    });
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Rotate: Client client-1' }));
    await user.click(screen.getByRole('button', { name: 'Rotate secret now' }));

    expect(requestsMock.rotateIntegrationClientSecret).toHaveBeenCalledWith('acme', 'client-1', 3);
    await waitFor(() =>
      expect(mockOneTimeCredentialsRender).toHaveBeenCalledWith({
        clientId: 'client-1',
        clientSecret: 'rotated-secret',
      }),
    );
  });

  it('purges the one-time secret from the mutation cache once its modal is dismissed', async () => {
    const client = createClient('client-1', { status: 'Active', version: 3 });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.rotateIntegrationClientSecret.mockResolvedValueOnce({
      client: createClient('client-1', { secretVersion: 2, version: 4 }),
      clientSecret: 'rotated-secret',
    });
    const user = userEvent.setup();
    const { queryClient } = renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Rotate: Client client-1' }));
    await user.click(screen.getByRole('button', { name: 'Rotate secret now' }));
    await waitFor(() =>
      expect(mockOneTimeCredentialsRender).toHaveBeenCalledWith({
        clientId: 'client-1',
        clientSecret: 'rotated-secret',
      }),
    );

    const secretStillInMutationCache = (): boolean =>
      queryClient
        .getMutationCache()
        .getAll()
        .some((mutation) => JSON.stringify(mutation.state.data).includes('rotated-secret'));
    expect(secretStillInMutationCache()).toBe(true);

    await user.click(screen.getByRole('checkbox', { name: 'team_seatings.integrations.credentials.acknowledge' }));
    await user.click(screen.getByRole('button', { name: 'team_seatings.integrations.credentials.done' }));

    await waitFor(() => expect(secretStillInMutationCache()).toBe(false));
  });

  it('revokes once with the current version and removes revoke/rotate actions afterward', async () => {
    const client = createClient('client-1', { status: 'Active', version: 3 });
    requestsMock.listIntegrationClients
      .mockResolvedValueOnce({ count: 1, results: [client] })
      .mockResolvedValueOnce({ count: 1, results: [createClient('client-1', { status: 'Revoked', version: 4 })] });
    requestsMock.revokeIntegrationClient.mockResolvedValueOnce(
      createClient('client-1', { status: 'Revoked', version: 4 }),
    );
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Revoke: Client client-1' }));
    await user.click(screen.getByRole('button', { name: 'Revoke client now' }));

    expect(requestsMock.revokeIntegrationClient).toHaveBeenCalledWith('acme', 'client-1', 3);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Revoke: Client client-1' })).not.toBeInTheDocument(),
    );
  });

  it('shows a stale-version conflict, offers a refresh, and clears it after refreshing', async () => {
    const client = createClient('client-1', { status: 'Active', version: 1 });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.revokeIntegrationClient.mockRejectedValueOnce(
      axiosProblem(409, 'result:oauth-client:stale-version', { extension: { currentVersion: 7 } }),
    );
    requestsMock.getIntegrationClient.mockResolvedValueOnce(createClient('client-1', { version: 7 }));
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Revoke: Client client-1' }));
    await user.click(screen.getByRole('button', { name: 'Revoke client now' }));

    expect(
      await screen.findByText('This client changed elsewhere (current version: 7). Refresh before retrying.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh client' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('reconciles after a not-active conflict without replaying the mutation', async () => {
    const client = createClient('client-1', { status: 'Active', version: 1 });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.rotateIntegrationClientSecret.mockRejectedValueOnce(
      axiosProblem(409, 'result:oauth-client:not-active'),
    );
    requestsMock.getIntegrationClient.mockResolvedValueOnce(createClient('client-1', { status: 'Expired' }));
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Rotate: Client client-1' }));
    await user.click(screen.getByRole('button', { name: 'Rotate secret now' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requestsMock.rotateIntegrationClientSecret).toHaveBeenCalledTimes(1);
  });

  it('syncs the list row after a not-active conflict reconciles, so a retry from the row sees the current status', async () => {
    const client = createClient('client-1', { status: 'Active', version: 1 });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.rotateIntegrationClientSecret.mockRejectedValueOnce(
      axiosProblem(409, 'result:oauth-client:not-active'),
    );
    requestsMock.getIntegrationClient.mockResolvedValueOnce(
      createClient('client-1', { status: 'Expired', version: 2 }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Rotate: Client client-1' }));
    await user.click(screen.getByRole('button', { name: 'Rotate secret now' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const listedClient = queryClient
      .getQueriesData<{ results: IntegrationClient[] }>({ queryKey: ['integrationClients', 'acme'] })
      .flatMap(([, data]) => data?.results ?? [])
      .find((listed) => listed.clientId === 'client-1');
    expect(listedClient?.version).toBe(2);
    expect(listedClient?.status).toBe('Expired');
  });

  it('evicts the client from the list cache when reconciling a not-active conflict finds it already deleted', async () => {
    const client = createClient('client-1', { status: 'Active', version: 1 });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.rotateIntegrationClientSecret.mockRejectedValueOnce(
      axiosProblem(409, 'result:oauth-client:not-active'),
    );
    requestsMock.getIntegrationClient.mockRejectedValueOnce(axiosProblem(404, 'result:oauth-client:client-not-found'));
    const user = userEvent.setup();
    const { queryClient } = renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Rotate: Client client-1' }));
    await user.click(screen.getByRole('button', { name: 'Rotate secret now' }));

    expect(await screen.findByText('This integration client is no longer available.')).toBeInTheDocument();
    // Every other not-found path in this module evicts the client from cached list pages; the
    // not-active reconciliation read must too, or the row stays visible and clickable.
    const listedClient = queryClient
      .getQueriesData<{ results: IntegrationClient[] }>({ queryKey: ['integrationClients', 'acme'] })
      .flatMap(([, data]) => data?.results ?? [])
      .find((listed) => listed.clientId === 'client-1');
    expect(listedClient).toBeUndefined();
  });

  it('keeps a forbidden mutation in the confirmation as a non-retryable error', async () => {
    const client = createClient('client-1', { status: 'Active', version: 1 });
    requestsMock.listIntegrationClients.mockResolvedValueOnce({ count: 1, results: [client] });
    requestsMock.revokeIntegrationClient.mockRejectedValueOnce(axiosProblem(403));
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Revoke: Client client-1' }));
    await user.click(screen.getByRole('button', { name: 'Revoke client now' }));

    expect(await screen.findByText('You do not have permission to change this client.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke client now' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes stale details and shows a notice after a client-not-found mutation response', async () => {
    const client = createClient('client-1', { status: 'Active', version: 1 });
    requestsMock.listIntegrationClients
      .mockResolvedValueOnce({ count: 1, results: [client] })
      .mockResolvedValueOnce({ count: 0, results: [] });
    requestsMock.revokeIntegrationClient.mockRejectedValueOnce(
      axiosProblem(404, 'result:oauth-client:client-not-found'),
    );
    const user = userEvent.setup();
    renderIntegrations();
    await screen.findByText('Client client-1');

    await user.click(screen.getByRole('button', { name: 'Revoke: Client client-1' }));
    await user.click(screen.getByRole('button', { name: 'Revoke client now' }));

    expect(await screen.findByText('This integration client is no longer available.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('IntegrationClientsTable', () => {
  beforeEach(() => {
    mockActiveLocale = 'en-GB';
    vi.clearAllMocks();
  });

  it('renders semantic translated columns, effective status badges, shortened ids, and localized dates', () => {
    const fullClientId = 'integration-client-1234567890';
    const clients = [
      createClient(fullClientId, { name: 'Active client', expiresAt: INSTANT, status: 'Active' }),
      createClient('expired-client', {
        name: 'Expired client',
        status: 'Expired',
        expiresAt: null,
        lastUsedAt: INSTANT,
      }),
      createClient('revoked-client', {
        name: 'Revoked client',
        status: 'Revoked',
        expiresAt: 'invalid-timestamp',
      }),
    ];

    render(<IntegrationClientsTable clients={clients} count={3} locale={mockActiveLocale} />);

    const table = screen.getByRole('table', { name: 'Integration clients' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Client', 'Status', 'Expires', 'Last used', 'Actions']);
    expect(within(table).getByText('Active')).toBeInTheDocument();
    expect(within(table).getByText('Expired')).toBeInTheDocument();
    expect(within(table).getByText('Revoked')).toBeInTheDocument();
    const fullAccessibleClientId = screen.getByText(fullClientId);
    expect(fullAccessibleClientId).not.toHaveAttribute('aria-hidden');
    const shortenedVisualClientId = screen.getByText('integrat…7890');
    expect(shortenedVisualClientId).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTitle(fullClientId)).toBe(shortenedVisualClientId);

    const expectedLocalDateTime = new Intl.DateTimeFormat(mockActiveLocale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(INSTANT));
    expect(screen.getAllByText(expectedLocalDateTime)).toHaveLength(2);
    expect(screen.getAllByText('No expiration')).toHaveLength(1);
    expect(screen.getAllByText('Never used')).toHaveLength(2);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('switches date formatting when the active locale changes', () => {
    const client = createClient('locale-client', { expiresAt: INSTANT });
    const view = render(<IntegrationClientsTable clients={[client]} count={1} locale={mockActiveLocale} />);
    const english = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(INSTANT),
    );
    expect(screen.getByText(english)).toBeInTheDocument();

    mockActiveLocale = 'pl-PL';
    view.rerender(<IntegrationClientsTable clients={[client]} count={1} locale={mockActiveLocale} />);

    const polish = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(INSTANT),
    );
    expect(screen.getByText(polish)).toBeInTheDocument();
  });

  it('exposes only real callbacks allowed by each backend lifecycle status', async () => {
    const user = userEvent.setup();
    const active = createClient('active', { name: 'Active client', status: 'Active' });
    const expired = createClient('expired', { name: 'Expired client', status: 'Expired' });
    const revoked = createClient('revoked', { name: 'Revoked client', status: 'Revoked' });
    const onDetails = vi.fn();
    const onEdit = vi.fn();
    const onRotate = vi.fn();
    const onRevoke = vi.fn();

    render(
      <IntegrationClientsTable
        clients={[active, expired, revoked]}
        count={3}
        locale={mockActiveLocale}
        onDetails={onDetails}
        onEdit={onEdit}
        onRotate={onRotate}
        onRevoke={onRevoke}
      />,
    );

    const activeRow = screen.getByRole('row', { name: /Active client/ });
    expect(within(activeRow).getByRole('button', { name: 'Actions: Active client' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(activeRow).getByRole('button', { name: 'Details: Active client' })).toBeEnabled();
    expect(within(activeRow).getByRole('button', { name: 'Edit: Active client' })).toBeEnabled();
    expect(within(activeRow).getByRole('button', { name: 'Rotate: Active client' })).toBeEnabled();
    expect(within(activeRow).getByRole('button', { name: 'Revoke: Active client' })).toBeEnabled();
    expect(within(activeRow).queryByRole('button', { name: 'Renew: Active client' })).not.toBeInTheDocument();

    const expiredRow = screen.getByRole('row', { name: /Expired client/ });
    expect(within(expiredRow).getByRole('button', { name: 'Details: Expired client' })).toBeEnabled();
    expect(within(expiredRow).getByRole('button', { name: 'Renew: Expired client' })).toBeEnabled();
    expect(within(expiredRow).getByRole('button', { name: 'Revoke: Expired client' })).toBeEnabled();
    expect(within(expiredRow).queryByRole('button', { name: 'Edit: Expired client' })).not.toBeInTheDocument();
    expect(within(expiredRow).queryByRole('button', { name: 'Rotate: Expired client' })).not.toBeInTheDocument();

    const revokedRow = screen.getByRole('row', { name: /Revoked client/ });
    expect(within(revokedRow).getByRole('button', { name: 'Details: Revoked client' })).toBeEnabled();
    expect(within(revokedRow).queryAllByRole('button')).toHaveLength(2);

    await user.click(within(activeRow).getByRole('button', { name: 'Details: Active client' }));
    await user.click(within(activeRow).getByRole('button', { name: 'Edit: Active client' }));
    await user.click(within(activeRow).getByRole('button', { name: 'Rotate: Active client' }));
    await user.click(within(expiredRow).getByRole('button', { name: 'Renew: Expired client' }));
    await user.click(within(expiredRow).getByRole('button', { name: 'Revoke: Expired client' }));

    expect(onDetails).toHaveBeenCalledWith(active);
    expect(onEdit).toHaveBeenNthCalledWith(1, active);
    expect(onEdit).toHaveBeenNthCalledWith(2, expired);
    expect(onRotate).toHaveBeenCalledWith(active);
    expect(onRevoke).toHaveBeenCalledWith(expired);
  });

  it('does not render nonfunctional action controls when callbacks are absent', () => {
    render(<IntegrationClientsTable clients={[createClient('active')]} count={1} locale={mockActiveLocale} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

it('allows inspecting demo integrations while disabling credential and configuration changes', async () => {
  demoMode.enabled = true;
  const client = createClient('demo-client');
  requestsMock.listIntegrationClients.mockResolvedValue({ count: 1, results: [client] });
  requestsMock.getIntegrationClient.mockResolvedValue(client);
  const user = userEvent.setup();
  renderIntegrations();
  await screen.findByText('Client demo-client');
  expect(screen.getByRole('button', { name: '+ Add client' })).toBeDisabled();
  for (const action of ['Edit', 'Rotate', 'Revoke']) {
    expect(screen.getByRole('button', { name: `${action}: Client demo-client` })).toBeDisabled();
  }
  await user.click(screen.getByRole('button', { name: 'Details: Client demo-client' }));
  expect(await screen.findByTestId('details-modal')).toBeInTheDocument();
  expect(requestsMock.createIntegrationClient).not.toHaveBeenCalled();
  expect(requestsMock.updateIntegrationClient).not.toHaveBeenCalled();
});
