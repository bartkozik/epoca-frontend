import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CancelInvitationVariables } from './hooks/useCancelInvitationMutation';
import type { UpdateInvitationVariables } from './hooks/useUpdateInvitationMutation';
import InvitationCompletionModal from './InvitationCompletionModal';
import InvitationRows from './InvitationRows';
import type { InvitationDto } from './models/invitationDto.model';

const mocks = vi.hoisted(() => ({
  update: vi.fn<(input: UpdateInvitationVariables) => Promise<InvitationDto>>(),
  resend: vi.fn<(input: UpdateInvitationVariables & { attemptId?: string }) => Promise<InvitationDto>>(),
  cancel: vi.fn<(input: CancelInvitationVariables) => Promise<void>>(),
  get: vi.fn<() => Promise<InvitationDto>>(),
  toast: vi.fn(),
}));
vi.mock('./hooks/useUpdateInvitationMutation', () => ({
  useUpdateInvitationMutation: () => ({ mutateAsync: mocks.update }),
}));
vi.mock('./hooks/useResendInvitationMutation', () => ({
  useResendInvitationMutation: () => ({ mutateAsync: mocks.resend }),
}));
vi.mock('./hooks/useCancelInvitationMutation', () => ({
  useCancelInvitationMutation: () => ({ mutateAsync: mocks.cancel }),
}));
vi.mock('./requests', () => ({ getInvitation: mocks.get }));
vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: mocks.toast }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { seconds?: number }) =>
      key.startsWith('invitations.cooldown.') ? `${key} ${params?.seconds}` : key,
    i18n: { language: 'en' },
  }),
}));
const invitation: InvitationDto = {
  id: '17d1bb14-4509-4030-932e-6cffcab68299',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  roles: ['Employee'],
  protocolVersion: 2,
  revision: '9007199254740993',
  status: 'Pending',
  expiresAt: null,
  delivery: { status: 'Unknown', lastAttemptAt: null, retryAfterSeconds: 0 },
  createdAt: '2026-10-01T00:00:00Z',
  modifiedAt: '2026-10-01T00:00:00Z',
};
const legacy: InvitationDto = { ...invitation, protocolVersion: 1, firstName: null };
const props = { organizationSlug: 'acme', featureEnabled: true };
const close = vi.fn();
function mount(ui: React.ReactNode): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
const rows = (items = [invitation], enabled = true): JSX.Element => (
  <table>
    <tbody>
      <InvitationRows {...props} featureEnabled={enabled} invitations={items} />
    </tbody>
  </table>
);
const modal = (item = legacy, slug = 'acme'): JSX.Element => (
  <InvitationCompletionModal {...props} organizationSlug={slug} invitation={item} onClose={close} />
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue(invitation);
  mocks.resend.mockResolvedValue(invitation);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.get.mockResolvedValue({ ...invitation, revision: '9007199254740994' });
});
it('shows only waiting Pending and Expired people without duplicating accepted history or offering projects', () => {
  mount(
    rows([
      invitation,
      { ...invitation, id: 'expired', status: 'Expired' },
      { ...invitation, id: 'accepted', status: 'Accepted' },
      { ...invitation, id: 'cancelled', status: 'Cancelled' },
    ]),
  );
  expect(screen.getByText('invitations.status.Pending')).toBeVisible();
  expect(screen.getByText('invitations.status.Expired')).toBeVisible();
  expect(screen.queryByText('invitations.status.Accepted')).not.toBeInTheDocument();
  expect(screen.queryByText('invitations.status.Cancelled')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /common.projects/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'invitations.action.resend' })).toHaveLength(2);
  expect(screen.getAllByRole('button')).toHaveLength(4);
});
it('updates a pending role with CAS and never sends a user mutation', async () => {
  mount(rows());
  await userEvent.click(screen.getAllByLabelText('invitations.form.role')[0]);
  await userEvent.click(screen.getByRole('option', { name: 'invitations.role.Owner' }));
  expect(mocks.update).toHaveBeenCalledWith({
    organizationSlug: 'acme',
    invitationId: invitation.id,
    input: { expectedRevision: invitation.revision, role: 'Owner' },
  });
});
it('requires confirmation before cancellation and keeps cancellation when sending is disabled', async () => {
  mount(rows([invitation], false));
  expect(screen.queryByRole('button', { name: 'invitations.action.resend' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.cancel' }));
  expect(mocks.cancel).not.toHaveBeenCalled();
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'invitations.action.cancel' }));
  expect(mocks.cancel).toHaveBeenCalledWith({
    organizationSlug: 'acme',
    invitationId: invitation.id,
    input: { expectedRevision: invitation.revision },
  });
});
it('shows Unknown delivery honestly and observes the server cooldown', () => {
  mount(rows([{ ...invitation, delivery: { ...invitation.delivery, retryAfterSeconds: 60 } }]));
  expect(screen.getByText('invitations.delivery.Unknown')).toBeVisible();
  expect(screen.getByRole('button', { name: 'invitations.action.resend' })).toBeDisabled();
});
it.each([
  ['Sent', 'sent'],
  ['Failed', 'retry'],
  ['Started', 'retry'],
  ['Unknown', 'retry'],
  ['NotSent', 'retry'],
  ['FutureStatus', 'retry'],
])('describes manual resend availability honestly for delivery %s', (status, message) => {
  mount(rows([{ ...invitation, delivery: { ...invitation.delivery, status, retryAfterSeconds: 60 } }]));
  expect(screen.getByRole('timer')).toHaveTextContent(`invitations.cooldown.${message} 60`);
});
it('does not restart the cooldown when delivery status refreshes for the same send attempt', async () => {
  vi.useFakeTimers();
  const item = { ...invitation, delivery: { ...invitation.delivery, retryAfterSeconds: 60 } };
  const view = mount(rows([item]));
  try {
    await act(() => vi.advanceTimersByTime(45_000));
    view.rerender(rows([{ ...item, delivery: { ...item.delivery, status: 'Sent' } }]));
    await act(() => vi.advanceTimersByTime(15_000));
    expect(screen.getByRole('button', { name: 'invitations.action.resend' })).toBeEnabled();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});
it.each(['success', 'rate-limit'] as const)('counts down after resend %s and becomes usable again', async (outcome) => {
  vi.useFakeTimers();
  if (outcome === 'success') {
    mocks.resend.mockResolvedValue({ ...invitation, delivery: { ...invitation.delivery, retryAfterSeconds: 60 } });
  } else {
    mocks.resend.mockRejectedValueOnce({ kind: 'rate-limited', status: 429, retryAfterSeconds: 60 });
  }
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const item =
    outcome === 'rate-limit' ? { ...invitation, delivery: { ...invitation.delivery, status: 'Sent' } } : invitation;
  const view = mount(rows([item]));
  const cooldownKey = outcome === 'rate-limit' ? 'invitations.cooldown.rateLimited' : 'invitations.cooldown.retry';
  try {
    const button = screen.getByRole('button', { name: 'invitations.action.resend' });
    await user.click(button);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(button).toBeDisabled();
    expect(screen.getByRole('timer')).toHaveTextContent(`${cooldownKey} 60`);
    expect(within(screen.getByRole('cell', { name: /ada@example.com/ })).getByRole('timer')).toBeVisible();
    await act(() => vi.advanceTimersByTime(59_000));
    expect(button).toBeDisabled();
    expect(screen.getByRole('timer')).toHaveTextContent(`${cooldownKey} 1`);
    await act(() => vi.advanceTimersByTime(1_000));
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.queryByText('invitations.error.rate-limited')).not.toBeInTheDocument();
    expect(button).toBeEnabled();
    await user.click(button);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mocks.resend).toHaveBeenCalledTimes(2);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});
it.each([
  ['Sent', 'success'],
  ['Failed', 'error'],
  ['Started', 'info'],
  ['Unknown', 'warning'],
])('uses a %s delivery toast with severity %s after resend', async (status, type) => {
  mocks.resend.mockResolvedValue({ ...invitation, delivery: { ...invitation.delivery, status } });
  mount(rows());
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.resend' }));
  expect(mocks.toast).toHaveBeenCalledWith({ content: `invitations.delivery.${status}`, type });
});
it('requires explicit completion for a legacy email and offers only cancellation for a phone', async () => {
  mount(
    rows([
      { ...invitation, protocolVersion: 1, firstName: null, roles: ['Future', 'Owner'] },
      { ...invitation, id: 'phone', email: '+48111222333', protocolVersion: 1 },
    ]),
  );
  expect(screen.getAllByRole('button', { name: 'invitations.action.resend' })).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.resend' }));
  expect(mocks.resend).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveValue('');
});
it('saves completed names, role and locale for a legacy invitation', async () => {
  mount(modal());
  await userEvent.type(screen.getByLabelText('invitations.form.firstName'), 'Ada');
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.save' }));
  expect(mocks.update).toHaveBeenCalledWith({
    organizationSlug: 'acme',
    invitationId: invitation.id,
    input: {
      expectedRevision: invitation.revision,
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'Employee',
      locale: 'en',
    },
  });
  expect(close).toHaveBeenCalledOnce();
});
it('keeps unsaved values on a revision conflict, refreshes latest and requires review before manual retry', async () => {
  mocks.update.mockRejectedValueOnce({ kind: 'revision-conflict', status: 409 });
  mount(modal());
  await userEvent.type(screen.getByLabelText('invitations.form.firstName'), 'draft');
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.save' }));
  expect(await screen.findByText('invitations.error.revision-conflict')).toBeVisible();
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveValue('draft');
  expect(screen.getByRole('button', { name: 'invitations.action.save' })).toBeDisabled();
  await userEvent.click(await screen.findByRole('button', { name: 'invitations.action.reviewed' }));
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.save' }));
  expect(mocks.update.mock.calls[1][0].input.expectedRevision).toBe('9007199254740994');
});
it('discards dirty drafts only after confirmation', async () => {
  mount(modal());
  await userEvent.type(screen.getByLabelText('invitations.form.firstName'), 'draft');
  await userEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
  expect(close).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'invitations.discard.confirm' }));
  expect(close).toHaveBeenCalledOnce();
});
it('drops callbacks after changing organization while a save is pending', async () => {
  let resolve!: (value: InvitationDto) => void;
  mocks.update.mockImplementationOnce(
    () =>
      new Promise<InvitationDto>((done) => {
        resolve = done;
      }),
  );
  const client = new QueryClient();
  const ui = (slug: string): JSX.Element => (
    <QueryClientProvider client={client}>{modal(legacy, slug)}</QueryClientProvider>
  );
  const view = render(ui('acme'));
  await userEvent.type(screen.getByLabelText('invitations.form.firstName'), 'draft');
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.save' }));
  view.rerender(ui('other'));
  act(() => resolve(invitation));
  await act(() => Promise.resolve());
  expect(close).not.toHaveBeenCalled();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(screen.queryByDisplayValue('draft')).not.toBeInTheDocument();
});
it('resend completion requires names and one explicit known role before sending', async () => {
  mount(
    <InvitationCompletionModal
      {...props}
      invitation={{ ...invitation, protocolVersion: 1, firstName: null, roles: ['Future', 'Owner'] }}
      resend
      onClose={close}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.resend' }));
  expect(mocks.resend).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText('invitations.form.firstName'), ' Ada ');
  await userEvent.click(screen.getByLabelText('invitations.form.role'));
  await userEvent.click(screen.getByRole('option', { name: 'invitations.role.Manager' }));
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.resend' }));
  expect(mocks.resend).toHaveBeenCalledWith(
    expect.objectContaining({
      input: {
        expectedRevision: invitation.revision,
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'Manager',
        locale: 'en',
      },
    }),
  );
  expect(mocks.toast).toHaveBeenCalledWith({ content: 'invitations.delivery.Unknown', type: 'warning' });
});
it('honors Retry-After inside legacy completion without losing edits', async () => {
  mocks.resend.mockRejectedValue({ kind: 'rate-limited', status: 429, retryAfterSeconds: 60 });
  mount(
    <InvitationCompletionModal {...props} invitation={{ ...invitation, protocolVersion: 1 }} resend onClose={close} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.resend' }));
  expect(await screen.findByRole('button', { name: 'invitations.action.resend' })).toBeDisabled();
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveValue('Ada');
});
it('does not let dismissing a row conflict silently adopt latest revision or retry a write', async () => {
  mocks.update.mockRejectedValueOnce({ kind: 'revision-conflict', status: 409 });
  mount(rows());
  await userEvent.click(screen.getAllByLabelText('invitations.form.role')[0]);
  await userEvent.click(screen.getByRole('option', { name: 'invitations.role.Owner' }));
  await screen.findByRole('button', { name: 'invitations.action.reviewed' });
  expect(mocks.update).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.reviewed' }));
  expect(mocks.update).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.retry' }));
  expect(mocks.update.mock.calls[1][0].input).toEqual({ expectedRevision: '9007199254740994', role: 'Owner' });
});
it.each(['Jozek', 'Bart', 'Anna'])(
  'resends only for %s and keeps its cooldown attached after rows reorder',
  async (name) => {
    const people: InvitationDto[] = ['Jozek', 'Bart', 'Anna'].map((firstName, index) => ({
      ...invitation,
      id: `17d1bb14-4509-4030-932e-6cffcab6829${index}`,
      firstName,
      email: `${firstName.toLowerCase()}@example.test`,
      revision: String(index + 1),
    }));
    const selected = people.find((person) => person.firstName === name)!;
    let finish!: (result: InvitationDto) => void;
    mocks.resend.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = mount(rows(people));
    const rowFor = (firstName: string): HTMLElement => screen.getByRole('row', { name: new RegExp(firstName) });
    await userEvent.click(within(rowFor(name)).getByRole('button', { name: 'invitations.action.resend' }));
    expect(mocks.resend).toHaveBeenCalledExactlyOnceWith({
      organizationSlug: 'acme',
      invitationId: selected.id,
      input: { expectedRevision: selected.revision },
    });
    view.rerender(rows([...people].reverse()));
    await act(() => {
      finish({ ...selected, delivery: { ...selected.delivery, retryAfterSeconds: 60 } });
      return Promise.resolve();
    });
    expect(within(rowFor(name)).getByRole('button', { name: 'invitations.action.resend' })).toBeDisabled();
    expect(within(rowFor(name)).getByRole('timer')).toBeVisible();
    for (const person of people.filter((item) => item.id !== selected.id)) {
      const row = within(rowFor(person.firstName!));
      expect(row.getByRole('button', { name: 'invitations.action.resend' })).toBeEnabled();
      expect(row.queryByRole('timer')).not.toBeInTheDocument();
    }
    expect(mocks.resend).toHaveBeenCalledTimes(1);
  },
);
it('keeps other rows usable while one resend is pending and ignores late unmounted callbacks', async () => {
  let resolve!: (value: InvitationDto) => void;
  mocks.resend.mockImplementationOnce(
    () =>
      new Promise<InvitationDto>((done) => {
        resolve = done;
      }),
  );
  const view = mount(rows([invitation, { ...invitation, id: 'second', firstName: 'Second' }]));
  await userEvent.click(screen.getAllByRole('button', { name: 'invitations.action.resend' })[0]);
  expect(screen.getAllByRole('button', { name: 'invitations.action.resend' })[1]).toBeEnabled();
  view.unmount();
  act(() => resolve(invitation));
  await act(() => Promise.resolve());
  expect(mocks.toast).not.toHaveBeenCalled();
});
it('focuses a missing legacy name and does not save until it is completed', async () => {
  mount(modal());
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.save' }));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveFocus();
  expect(screen.getByText('invitations.validation.name')).toBeVisible();
  await userEvent.type(screen.getByLabelText('invitations.form.firstName'), 'Ada');
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.save' }));
  expect(mocks.update.mock.calls[0][0].input.firstName).toBe('Ada');
});
it('never displays raw rejected data and preserves the draft for manual retry', async () => {
  mocks.update.mockRejectedValueOnce({ secret: 'PRIVATE_PAYLOAD' });
  mount(modal());
  await userEvent.type(screen.getByLabelText('invitations.form.firstName'), 'draft');
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.save' }));
  expect(screen.getByRole('alert')).toHaveTextContent('invitations.error.retry');
  expect(screen.queryByText(/PRIVATE_PAYLOAD/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveValue('draft');
});
it('does not submit stale role state when a custom select consumes Ctrl+Enter', async () => {
  mount(<InvitationCompletionModal {...props} invitation={{ ...invitation, protocolVersion: 1 }} onClose={close} />);
  Element.prototype.scrollIntoView = vi.fn();
  const role = screen.getByLabelText('invitations.form.role');
  await userEvent.click(role);
  fireEvent.keyDown(role, { key: 'ArrowDown' });
  fireEvent.keyDown(role, { key: 'Enter', ctrlKey: true });
  expect(mocks.update).not.toHaveBeenCalled();
});
it('does not offer operations for unrecognized history status', () => {
  mount(rows([{ ...invitation, status: 'Future' }]));
  expect(screen.getByText('invitations.status.Unknown')).toBeVisible();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});

it.each(['invitations.action.retry', 'invitations.action.resend'])(
  'preserves the uncertain resend body after a background revision refresh when using %s',
  async (button) => {
    mocks.resend.mockRejectedValueOnce({ kind: 'timeout', status: null });
    const view = mount(rows());
    await userEvent.click(screen.getByRole('button', { name: 'invitations.action.resend' }));
    view.rerender(rows([{ ...invitation, revision: '9007199254740994' }]));
    await userEvent.click(screen.getByRole('button', { name: button }));
    expect(mocks.resend.mock.calls[1][0]).toEqual(mocks.resend.mock.calls[0][0]);
    expect(mocks.resend.mock.calls[1][0].input.expectedRevision).toBe('9007199254740993');
  },
);

it('retains the captured role revision on Retry after a timeout and background refresh', async () => {
  mocks.update.mockRejectedValueOnce({ kind: 'timeout', status: null });
  const view = mount(rows());
  await userEvent.click(screen.getAllByLabelText('invitations.form.role')[0]);
  await userEvent.click(screen.getByRole('option', { name: 'invitations.role.Owner' }));
  view.rerender(rows([{ ...invitation, revision: '9007199254740994' }]));
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.retry' }));
  expect(mocks.update.mock.calls[1][0]).toEqual(mocks.update.mock.calls[0][0]);
});
it('retains the captured cancellation revision through repeated confirmation after timeout', async () => {
  mocks.cancel.mockRejectedValueOnce({ kind: 'timeout', status: null });
  const view = mount(rows());
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.cancel' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'invitations.action.cancel' }));
  view.rerender(rows([{ ...invitation, revision: '9007199254740994' }]));
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.retry' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'invitations.action.cancel' }));
  expect(mocks.cancel.mock.calls[1][0]).toEqual(mocks.cancel.mock.calls[0][0]);
});

it('preserves an open completion draft after background acceptance removes its row, and shows terminal conflict without retry', async () => {
  mocks.resend.mockRejectedValueOnce({ kind: 'revision-conflict', status: 409 });
  mocks.get.mockResolvedValueOnce({ ...legacy, status: 'Accepted', revision: '9007199254740994' });
  const view = mount(rows([legacy]));
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.resend' }));
  await userEvent.type(screen.getByLabelText('invitations.form.firstName'), 'preserved draft');
  view.rerender(rows([{ ...legacy, status: 'Accepted', revision: '9007199254740994' }]));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveValue('preserved draft');
  expect(screen.queryByRole('row')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.resend' }));
  expect(await screen.findByText(/invitations.status.Accepted/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'invitations.action.reviewed' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'invitations.action.resend' })).toBeDisabled();
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveValue('preserved draft');
});
it('preserves cancellation revision when the primary Cancel button repeats a timed-out operation', async () => {
  mocks.cancel.mockRejectedValueOnce({ kind: 'timeout', status: null });
  const view = mount(rows());
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.cancel' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'invitations.action.cancel' }));
  view.rerender(rows([{ ...invitation, revision: '9007199254740994' }]));
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.cancel' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'invitations.action.cancel' }));
  expect(mocks.cancel.mock.calls[1][0]).toEqual(mocks.cancel.mock.calls[0][0]);
});
it.each([
  ['Owner', '9007199254740993'],
  ['Manager', '9007199254740994'],
])('role selection %s after a timed-out Owner change uses revision %s', async (role, revision) => {
  mocks.update.mockRejectedValueOnce({ kind: 'timeout', status: null });
  const view = mount(rows());
  await userEvent.click(screen.getAllByLabelText('invitations.form.role')[0]);
  await userEvent.click(screen.getByRole('option', { name: 'invitations.role.Owner' }));
  view.rerender(rows([{ ...invitation, revision: '9007199254740994' }]));
  await userEvent.click(screen.getAllByLabelText('invitations.form.role')[0]);
  await userEvent.click(screen.getByRole('option', { name: `invitations.role.${role}` }));
  expect(mocks.update.mock.calls[1][0].input).toEqual({ expectedRevision: revision, role });
});

it('adopts a refreshed list after conflict review without adopting an older revision', async () => {
  mocks.update.mockRejectedValueOnce({ kind: 'revision-conflict', status: 409 });
  const reviewed = { ...invitation, revision: '9007199254740994', roles: ['Manager'] };
  mocks.get.mockResolvedValueOnce(reviewed);
  const view = mount(rows());
  await userEvent.click(screen.getAllByLabelText('invitations.form.role')[0]);
  await userEvent.click(screen.getByRole('option', { name: 'invitations.role.Owner' }));
  await userEvent.click(await screen.findByRole('button', { name: 'invitations.action.reviewed' }));
  view.rerender(rows([{ ...invitation }]));
  expect(screen.getAllByLabelText('invitations.form.role')[0]).toHaveValue('invitations.role.Manager');
  view.rerender(rows([{ ...reviewed, delivery: { ...reviewed.delivery, status: 'Sent' } }]));
  expect(screen.getByText('invitations.delivery.Sent')).toBeVisible();
  view.rerender(rows([{ ...reviewed, revision: '9007199254740995', roles: ['Owner'] }]));
  expect(screen.getAllByLabelText('invitations.form.role')[0]).toHaveValue('invitations.role.Owner');
  expect(mocks.update).toHaveBeenCalledOnce();
});

it('shows read-only invitation previews without sending, editing or cancelling', async () => {
  const user = userEvent.setup();
  mount(
    <table>
      <tbody>
        <InvitationRows {...props} invitations={[invitation]} readOnly />
      </tbody>
    </table>,
  );
  const resend = screen.getByRole('button', { name: /invitations.action.resend/ });
  const cancel = screen.getByRole('button', { name: /invitations.action.cancel/ });
  expect(resend).toBeDisabled();
  expect(cancel).toBeDisabled();
  await user.click(resend);
  await user.click(cancel);
  expect(mocks.resend).not.toHaveBeenCalled();
  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
