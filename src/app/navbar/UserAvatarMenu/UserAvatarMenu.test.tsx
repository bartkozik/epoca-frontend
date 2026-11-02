import { webcrypto } from 'node:crypto';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useHasMoreThanOneOrganization } from '@/modules/organizations/hooks/useOrganizationsQuery';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useUserQuery } from '@/modules/users/hooks/useUserQuery';
import { RawUserSchema } from '@/modules/users/models/userDto.model';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import UserAvatarMenu from './UserAvatarMenu';

const renderUserAvatarMenu = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <UserAvatarMenu setIsMenuOpen={vi.fn()} />
    </MemoryRouter>,
  );

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: vi.fn() }));
vi.mock('@/modules/organizations/hooks/useOrganizationsQuery', () => ({ useHasMoreThanOneOrganization: vi.fn() }));
vi.mock('@/modules/users/hooks/useUserQuery', () => ({ useUserQuery: vi.fn() }));
vi.mock('./useCheckoutFromWorkspace', () => ({ useCheckoutFromWorkspace: () => vi.fn() }));

const useAuthMock = vi.mocked(useAuth);
const useWorkspaceMock = vi.mocked(useWorkspace);
const useUserQueryMock = vi.mocked(useUserQuery);
const useHasMoreThanOneOrganizationMock = vi.mocked(useHasMoreThanOneOrganization);

const rawUserProfile = RawUserSchema.parse({
  archivedAt: '',
  avatar: 'https://cdn.example.com/avatars/user-1/hash.png',
  color: '#123456',
  createdAt: '',
  firstName: 'Ada',
  id: 'user-1',
  identities: [],
  isSuperAdmin: false,
  lastName: 'Lovelace',
  modifiedAt: '',
});

beforeEach(() => {
  useHasMoreThanOneOrganizationMock.mockReturnValue(false);
  useAuthMock.mockReturnValue({
    loggedInUser: { id: 'user-1', email: 'ada@example.com', isSuperAdmin: false },
    changeUserLanguage: vi.fn(),
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  useWorkspaceMock.mockReturnValue({
    contextOrganizationLoggedInUser: undefined,
    fetchContextOrganizationUsers: vi.fn().mockResolvedValue([]),
  } as unknown as ReturnType<typeof useWorkspace>);
});

describe('UserAvatarMenu avatar source', () => {
  it('keeps the authorized session email when the real profile response has no identities', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const { identities: _identities, ...profileWithoutIdentities } = rawUserProfile;
    useUserQueryMock.mockReturnValue({
      data: RawUserSchema.parse({ ...profileWithoutIdentities, avatar: null }),
    } as unknown as ReturnType<typeof useUserQuery>);
    try {
      renderUserAvatarMenu();
      expect(await screen.findByRole('img', { name: 'Ada Lovelace' })).toHaveAttribute(
        'src',
        'https://gravatar.com/avatar/b5fc85e55755f9e0d030a10ab4429b6b2944855f9a0d60077fe832becbc41d72?s=96&r=g&d=404',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('links to the external Gravatar editor in a new tab', () => {
    useUserQueryMock.mockReturnValue({ data: rawUserProfile } as unknown as ReturnType<typeof useUserQuery>);
    renderUserAvatarMenu();
    fireEvent.click(screen.getByTestId('user-avatar-menu-button'));
    const link = screen.getByRole('link', { name: 'common.change_avatar_gravatar' });
    expect(link).toHaveAttribute('href', 'https://gravatar.com/profile/avatars');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows the real avatar from the fetched user profile', () => {
    useUserQueryMock.mockReturnValue({ data: rawUserProfile } as unknown as ReturnType<typeof useUserQuery>);

    renderUserAvatarMenu();

    const image = screen.getByRole('img', { name: 'Ada Lovelace' });
    expect(image).toHaveAttribute('src', rawUserProfile.avatar);
  });

  it('falls back to initials when the profile has not loaded yet', () => {
    useUserQueryMock.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useUserQuery>);

    renderUserAvatarMenu();

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('prefers the fetched profile avatar over a stale org-context avatar', () => {
    useUserQueryMock.mockReturnValue({ data: rawUserProfile } as unknown as ReturnType<typeof useUserQuery>);
    useWorkspaceMock.mockReturnValue({
      contextOrganizationLoggedInUser: {
        id: 'user-1',
        avatar: 'https://cdn.example.com/old.png',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        displayedName: 'Ada Lovelace',
        email: 'ada@example.com',
        identities: [],
        organizationRoles: [],
        archived: false,
        projects: [],
      },
      fetchContextOrganizationUsers: vi.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof useWorkspace>);

    renderUserAvatarMenu();

    const image = screen.getByRole('img', { name: 'Ada Lovelace' });
    expect(image).toHaveAttribute('src', rawUserProfile.avatar);
  });
});
