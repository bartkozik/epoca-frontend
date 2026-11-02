import { User } from '@/modules/users/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GroupedAvatars from './GroupedAvatars';

vi.mock('react-i18next', () => ({
  initReactI18next: { init: vi.fn(), type: '3rdParty' },
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; name?: string }) => {
      if (options?.name) return `${key}:${options.name}`;
      if (options?.count !== undefined) return `${key}:${options.count}`;
      return key;
    },
  }),
}));

vi.mock('@/core/i18n/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

const createUser = (overrides: Partial<User> = {}): User => ({
  archived: false,
  archivedAt: '',
  avatar: '',
  color: '',
  createdAt: '',
  displayedName: 'User',
  email: 'user@example.com',
  firstName: 'User',
  fullName: 'User',
  id: 'user-id',
  identities: [],
  isLoggedInUser: false,
  isSuperAdmin: false,
  lastName: 'User',
  modifiedAt: '',
  projects: [],
  ...overrides,
});

describe('GroupedAvatars', () => {
  it('opens a labelled disclosure button and renders each resolved user label', () => {
    render(
      <GroupedAvatars
        items={[
          createUser({ id: 'user-5', fullName: 'User 5' }),
          createUser({ id: 'user-6', fullName: ' ', displayedName: ' ', email: 'six@example.com' }),
        ]}
      />,
    );

    const toggle = screen.getByRole('button', {
      name: 'projects.project_user_search.action.show_grouped_users:2',
    });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('User 5')).toBeInTheDocument();
    expect(screen.getByText('six@example.com')).toBeInTheDocument();
  });

  it('removes a user only through its explicit remove button', () => {
    const user = createUser({ id: 'user-5', fullName: 'User 5' });
    const onItemDelete = vi.fn();

    render(<GroupedAvatars items={[user]} onItemDelete={onItemDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'projects.project_user_search.action.show_grouped_users:1' }));
    fireEvent.click(screen.getByText('User 5'));

    expect(onItemDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'projects.project_user_search.action.remove_user:User 5' }));

    expect(onItemDelete).toHaveBeenCalledWith(user);
  });

  it('protects the logged-in owner from removal', () => {
    render(<GroupedAvatars items={[createUser({ id: 'owner', isLoggedInUser: true })]} />);

    fireEvent.click(screen.getByRole('button', { name: 'projects.project_user_search.action.show_grouped_users:1' }));

    expect(screen.queryByRole('button', { name: /remove_user/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'projects.project_user_search.status.logged_in_owner_protected' }),
    ).toBeInTheDocument();
  });

  it('closes the grouped panel on an outside mousedown', () => {
    render(
      <>
        <button type="button">Outside</button>
        <GroupedAvatars items={[createUser({ id: 'user-5', fullName: 'User 5' })]} />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'projects.project_user_search.action.show_grouped_users:1' }));

    expect(
      screen.getByRole('button', { name: 'projects.project_user_search.action.remove_user:User 5' }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));

    expect(
      screen.queryByRole('button', { name: 'projects.project_user_search.action.remove_user:User 5' }),
    ).not.toBeInTheDocument();
  });

  it('closes on Escape and restores focus to the disclosure button', async () => {
    render(<GroupedAvatars items={[createUser({ id: 'user-5', fullName: 'User 5' })]} />);

    const toggle = screen.getByRole('button', { name: 'projects.project_user_search.action.show_grouped_users:1' });
    fireEvent.click(toggle);

    const removeButton = screen.getByRole('button', { name: 'projects.project_user_search.action.remove_user:User 5' });
    removeButton.focus();
    fireEvent.keyDown(removeButton, { key: 'Escape' });

    expect(screen.queryByText('User 5')).not.toBeInTheDocument();
    await waitFor(() => expect(toggle).toHaveFocus());
  });

  it('closes on Escape from the focused disclosure button without propagating to its parent', async () => {
    const onParentKeyDown = vi.fn();

    render(
      <div onKeyDown={onParentKeyDown}>
        <GroupedAvatars items={[createUser({ id: 'user-5', fullName: 'User 5' })]} />
      </div>,
    );

    const toggle = screen.getByRole('button', { name: 'projects.project_user_search.action.show_grouped_users:1' });
    toggle.focus();
    fireEvent.click(toggle);
    fireEvent.keyDown(toggle, { key: 'Escape' });

    expect(onParentKeyDown).not.toHaveBeenCalled();
    expect(screen.queryByText('User 5')).not.toBeInTheDocument();
    await waitFor(() => expect(toggle).toHaveFocus());
  });
});
