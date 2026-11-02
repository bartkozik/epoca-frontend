import { OrganizationUserRole } from '@/core/models/enums';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvitationForm from './InvitationForm';
import type { InvitationCreate } from './models/invitationCreate.model';
import type { InvitationDto } from './models/invitationDto.model';

const mocks = vi.hoisted(() => ({
  create:
    vi.fn<
      (input: { organizationSlug: string; input: InvitationCreate }) => Promise<{ delivery: { status: string } }>
    >(),
  toast: vi.fn(),
}));
vi.mock('./hooks/useCreateInvitationMutation', () => ({
  useCreateInvitationMutation: () => ({ mutateAsync: mocks.create }),
}));
vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: mocks.toast }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', resolvedLanguage: 'en' } }),
}));
const props = { isOpen: true, organizationSlug: 'acme', onClose: vi.fn() };
const mount = (): Pick<RenderResult, 'rerender' | 'unmount'> & { client: QueryClient } => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...render(<InvitationForm {...props} />, { wrapper }), client };
};
const basics = async (): Promise<ReturnType<typeof userEvent.setup>> => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('invitations.form.firstName'), ' Ada ');
  await user.type(screen.getByLabelText('invitations.form.lastName'), ' Lovelace ');
  await user.type(screen.getByLabelText('invitations.form.email'), 'ada@example.com');
  return user;
};
const submit = (): HTMLElement => screen.getByRole('button', { name: 'invitations.form.submit' });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ delivery: { status: 'Sent' } });
});

it('focuses the first input and submits only the normalized invitation basics', async () => {
  mount();
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveFocus();
  const user = await basics();
  await user.click(submit());
  expect(mocks.create).toHaveBeenCalledWith({
    organizationSlug: 'acme',
    input: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      role: OrganizationUserRole.Employee,
      locale: 'en',
    },
  });
  expect(props.onClose).toHaveBeenCalledOnce();
});
it('validates basics and focuses first invalid input without submitting', async () => {
  mount();
  await userEvent.click(submit());
  expect(mocks.create).not.toHaveBeenCalled();
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveFocus();
  expect(screen.getAllByText('invitations.validation.name')).toHaveLength(2);
});
it.each(['Enter', 'ControlEnter'])('submits the only form with %s', async (key) => {
  mount();
  const user = await basics();
  expect(screen.getAllByRole('form')).toHaveLength(1);
  await user.keyboard(key === 'Enter' ? '{Enter}' : '{Control>}{Enter}{/Control}');
  expect(mocks.create).toHaveBeenCalledOnce();
});
it.each(['cancel', 'escape', 'close', 'outside'])(
  'confirms unsaved changes on %s and keeps entries after cancel',
  async (method) => {
    mount();
    const user = await basics();
    if (method === 'cancel') await user.click(screen.getByRole('button', { name: 'common.cancel' }));
    if (method === 'close') await user.click(screen.getByRole('button', { name: 'common.close' }));
    if (method === 'escape') await user.keyboard('{Escape}');
    if (method === 'outside') fireEvent.mouseDown(document.body);
    const confirm = screen.getByRole('dialog', { name: 'invitations.discard.title' });
    expect(props.onClose).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'invitations.discard.keep' }));
    expect(screen.getByLabelText('invitations.form.email')).toHaveValue('ada@example.com');
  },
);
it('guards double submit and all closing paths until the write finishes', async () => {
  let resolve!: (value: { delivery: { status: string } }) => void;
  mocks.create.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  const user = await basics();
  fireEvent.click(submit());
  fireEvent.click(submit());
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(submit()).toBeDisabled();
  expect(screen.getByLabelText('invitations.form.email')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'common.cancel' }));
  await user.keyboard('{Escape}');
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument();
  expect(props.onClose).not.toHaveBeenCalled();
  await act(() => {
    resolve({ delivery: { status: 'Sent' } });
    return Promise.resolve();
  });
  expect(props.onClose).toHaveBeenCalledOnce();
});
it.each([
  ['transport', null],
  ['revision-conflict', 409],
] as const)('keeps drafts on %s and renders only safe guidance', async (kind, status) => {
  mocks.create.mockRejectedValue({ kind, status });
  mount();
  const user = await basics();
  await user.click(submit());
  expect(screen.getByLabelText('invitations.form.email')).toHaveValue('ada@example.com');
  expect(screen.getByRole('alert')).toHaveTextContent(
    status === 409 ? 'invitations.error.conflict' : 'invitations.error.retry',
  );
  expect(props.onClose).not.toHaveBeenCalled();
});
it.each(['unmount', 'organization', 'closed'] as const)('ignores stale write success after %s', async (change) => {
  let resolve!: (value: { delivery: { status: string } }) => void;
  mocks.create.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = mount();
  const user = await basics();
  await user.click(submit());
  if (change === 'unmount') view.unmount();
  if (change === 'organization') view.rerender(<InvitationForm {...props} organizationSlug="other" />);
  if (change === 'closed') {
    view.rerender(<InvitationForm {...props} isOpen={false} />);
    view.rerender(<InvitationForm {...props} />);
  }
  await act(() => {
    resolve({ delivery: { status: 'Sent' } });
    return Promise.resolve();
  });
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
});
it.each(['Sent', 'Failed', 'Unknown', 'Started', 'NotSent'])(
  'reports actual %s delivery without treating creation as mail sent',
  async (status) => {
    mocks.create.mockResolvedValue({ delivery: { status } });
    mount();
    const user = await basics();
    await user.click(submit());
    expect(mocks.toast).toHaveBeenCalledWith({
      content: `invitations.delivery.${status}`,
      type: status === 'Sent' ? 'success' : status === 'Failed' ? 'error' : status === 'Started' ? 'info' : 'warning',
    });
  },
);

it.each(['already-member', 'already-exists', 'idempotency-conflict', 'identity-conflict'])(
  'shows specific safe guidance for %s conflicts and allows a deliberate corrected attempt',
  async (kind) => {
    mocks.create.mockRejectedValueOnce({ kind, status: 409 });
    mount();
    const user = await basics();
    await user.click(submit());
    expect(screen.getByText(`invitations.error.${kind}`)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('invitations.form.email'));
    await user.type(screen.getByLabelText('invitations.form.email'), 'corrected@example.com');
    expect(mocks.create).toHaveBeenCalledOnce();
    await user.click(submit());
    expect(mocks.create).toHaveBeenCalledTimes(2);
  },
);

it('discards the failed draft when a closed form is reopened', async () => {
  mocks.create.mockRejectedValue({ kind: 'transport', status: null });
  const view = mount();
  let user = await basics();
  await user.click(submit());
  view.rerender(<InvitationForm {...props} isOpen={false} />);
  view.rerender(<InvitationForm {...props} />);
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveValue('');
  expect(screen.queryByText('invitations.error.retry')).not.toBeInTheDocument();
  user = await basics();
  await user.click(submit());
  expect(mocks.create).toHaveBeenCalledTimes(2);
});

it('submits a changed role', async () => {
  mount();
  const user = await basics();
  await user.click(screen.getByLabelText('invitations.form.role'));
  await user.click(screen.getByRole('option', { name: 'invitations.role.Manager' }));
  await user.click(submit());
  expect(mocks.create.mock.calls[0][0].input).toMatchObject({ role: OrganizationUserRole.Manager });
});
it('closes without confirmation when nothing was entered', async () => {
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog', { name: 'invitations.discard.title' })).not.toBeInTheDocument();
});
it('discards a dirty form only after the confirmation action', async () => {
  mount();
  const user = await basics();
  await user.click(screen.getByRole('button', { name: 'common.close' }));
  await user.click(screen.getByRole('button', { name: 'invitations.discard.confirm' }));
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(mocks.create).not.toHaveBeenCalled();
});
it('does not leak raw error details into the form', async () => {
  mocks.create.mockRejectedValue(new Error('sensitive upstream detail'));
  mount();
  const user = await basics();
  await user.click(submit());
  expect(screen.queryByText('sensitive upstream detail')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('invitations.error.retry');
});
it('ignores a failed response after the organization changes', async () => {
  let reject!: (reason: unknown) => void;
  mocks.create.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const view = mount();
  const user = await basics();
  await user.click(submit());
  view.rerender(<InvitationForm {...props} organizationSlug="other" />);
  await act(() => {
    reject({ kind: 'already-exists', status: 409 });
    return Promise.resolve();
  });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText('invitations.form.email')).toHaveValue('');
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
});

it('lets the role selector consume Ctrl+Enter without submitting the previous role', async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mount();
  const user = await basics();
  const role = screen.getByLabelText('invitations.form.role');
  await user.click(role);
  await user.click(screen.getByRole('option', { name: 'invitations.role.Owner' }));
  await user.click(role);
  await user.keyboard('{ArrowDown}');
  expect(role).toHaveAttribute(
    'aria-activedescendant',
    screen.getByRole('option', { name: 'invitations.role.Employee' }).id,
  );
  await user.keyboard('{Control>}{Enter}{/Control}');
  expect(role).toHaveValue('invitations.role.Employee');
  expect(mocks.create).not.toHaveBeenCalled();

  await user.click(screen.getByLabelText('invitations.form.email'));
  await user.keyboard('{Control>}{Enter}{/Control}');
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.create.mock.calls[0][0].input.role).toBe(OrganizationUserRole.Employee);
});

const existingInvitation: InvitationDto = {
  id: '17d1bb14-4509-4030-932e-6cffcab68299',
  email: 'ADA@example.com',
  firstName: 'Original',
  lastName: 'Invitee',
  roles: ['Employee'],
  protocolVersion: 2,
  revision: '1',
  status: 'Pending',
  expiresAt: null,
  delivery: { status: 'Sent', lastAttemptAt: null, retryAfterSeconds: 0 },
  createdAt: '2026-10-01T00:00:00Z',
  modifiedAt: '2026-10-01T00:00:00Z',
};
it.each(['Pending', 'Expired'])(
  'blocks an existing %s invitation before sending, including keyboard submission',
  async (status) => {
    const view = mount();
    view.rerender(<InvitationForm {...props} existingInvitations={[{ ...existingInvitation, status }]} />);
    const user = await basics();
    const email = screen.getByLabelText('invitations.form.email');
    fireEvent.change(email, { target: { value: '  ada@EXAMPLE.com  ' } });
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('invitations.error.already-exists')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    await user.keyboard('{Enter}{Control>}{Enter}{/Control}');
    fireEvent.submit(screen.getByRole('form'));
    expect(mocks.create).not.toHaveBeenCalled();
    await user.clear(email);
    await user.type(email, 'new@example.com');
    expect(submit()).toBeEnabled();
    expect(screen.queryByText('invitations.error.already-exists')).not.toBeInTheDocument();
    await user.click(submit());
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create.mock.calls[0][0].input.email).toBe('new@example.com');
  },
);
it.each(['Cancelled', 'Accepted'])('does not block a new invitation based only on %s history', async (status) => {
  const view = mount();
  view.rerender(<InvitationForm {...props} existingInvitations={[{ ...existingInvitation, status }]} />);
  const user = await basics();
  await user.click(submit());
  expect(mocks.create).toHaveBeenCalledOnce();
});
it('blocks a duplicate appearing in a refreshed list without losing the form draft', async () => {
  const view = mount();
  await basics();
  expect(submit()).toBeEnabled();
  view.rerender(<InvitationForm {...props} existingInvitations={[existingInvitation]} />);
  expect(submit()).toBeDisabled();
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveValue(' Ada ');
  view.rerender(<InvitationForm {...props} existingInvitations={[{ ...existingInvitation, status: 'Cancelled' }]} />);
  expect(submit()).toBeEnabled();
});

it.each(['already-member', 'already-exists'])('blocks the same email after a server %s conflict', async (kind) => {
  mocks.create.mockRejectedValueOnce({ kind, status: 409 });
  mount();
  const user = await basics();
  await user.click(submit());
  const email = screen.getByLabelText('invitations.form.email');
  expect(email).toHaveAttribute('aria-invalid', 'true');
  expect(email).toHaveFocus();
  expect(submit()).toBeDisabled();
  fireEvent.submit(screen.getByRole('form'));
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
  await user.clear(email);
  await user.type(email, 'corrected@example.com');
  expect(submit()).toBeEnabled();
  expect(screen.queryByText(`invitations.error.${kind}`)).not.toBeInTheDocument();
  await user.clear(email);
  await user.type(email, 'ADA@example.com');
  expect(submit()).toBeDisabled();
});
