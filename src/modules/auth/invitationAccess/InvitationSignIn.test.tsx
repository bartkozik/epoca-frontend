import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import InvitationSignIn from './InvitationSignIn';

vi.mock('../login/Login', () => ({
  default: ({ invitationReturn }: { invitationReturn: boolean }) => (
    <div>{invitationReturn ? 'invitation' : 'normal'}</div>
  ),
}));
it.each([
  ['/invitations/sign-in', 'invitation'],
  ['/invitations/sign-in?joined=1', 'normal'],
  ['/invitations/sign-in?sessionRecovery=1', 'normal'],
  ['/invitations/sign-in?returnUrl=https://evil.example', 'invitation'],
])('uses a fixed return for %s', (path, expected) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <InvitationSignIn />
    </MemoryRouter>,
  );
  expect(screen.getByText(expected)).toBeInTheDocument();
});
