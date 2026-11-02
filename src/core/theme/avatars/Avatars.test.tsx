import { User } from '@/modules/users/types';
import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Avatars from './Avatars';

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

const createUser = (id: string): User => ({
  archived: false,
  archivedAt: '',
  avatar: '',
  color: '',
  createdAt: '',
  displayedName: `User ${id}`,
  email: `user-${id}@example.com`,
  firstName: 'User',
  fullName: `User ${id}`,
  id,
  identities: [],
  isLoggedInUser: false,
  isSuperAdmin: false,
  lastName: id,
  modifiedAt: '',
  projects: [],
});

const AvatarsHarness = (): JSX.Element => {
  const [items, setItems] = useState([
    createUser('1'),
    createUser('2'),
    createUser('3'),
    createUser('4'),
    createUser('5'),
  ]);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Avatars
      addButtonRef={addButtonRef}
      items={items}
      onItemDelete={(item) => setItems((current) => current.filter(({ id }) => id !== item.id))}
    />
  );
};

describe('Avatars', () => {
  it('focuses the adjacent add button after removing the final grouped user', async () => {
    render(<AvatarsHarness />);

    const toggle = screen.getByRole('button', { name: 'projects.project_user_search.action.show_grouped_users:1' });
    expect(toggle).toBeInTheDocument();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'projects.project_user_search.action.remove_user:User 5' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'projects.project_user_search.action.show_grouped_users:1' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '+' })).toHaveFocus());
  });
});
