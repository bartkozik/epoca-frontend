import { webcrypto } from 'node:crypto';
import { DisplayableUser } from '@/core/theme/types';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import UserInitialsAvatar from './UserInitialsAvatar';

vi.mock('@/core/theme/spinner', () => ({
  default: ({ loading }: { loading?: boolean }) => (loading ? <span role="progressbar" /> : null),
}));

const user: DisplayableUser = {
  avatar: 'https://cdn.example.com/avatars/user-1/hash.png',
  color: '#123456',
  fullName: 'Ada Lovelace',
  id: 'user-1',
};

describe('UserInitialsAvatar', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the spinner through URL preparation and image loading without flashing initials', async () => {
    let resolveDigest!: (value: ArrayBuffer) => void;
    const digest = new Promise<ArrayBuffer>((resolve) => {
      resolveDigest = resolve;
    });
    vi.stubGlobal('crypto', { subtle: { digest: () => digest } });
    render(<UserInitialsAvatar item={{ ...user, avatar: undefined, email: 'ada@example.com' }} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
    await act(async () => {
      resolveDigest(new ArrayBuffer(32));
      await digest;
    });

    const image = await screen.findByRole('img');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
    fireEvent.load(image);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
  });

  it('keeps the spinner between a failed primary image and the Gravatar result', async () => {
    render(<UserInitialsAvatar item={{ ...user, email: 'ada@example.com' }} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('AL')).not.toBeInTheDocument();

    const fallback = await screen.findByRole('img');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    fireEvent.error(fallback);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('stops loading when URL preparation fails', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockRejectedValue(new Error('Unavailable')) } });
    render(<UserInitialsAvatar item={{ ...user, avatar: undefined, email: 'ada@example.com' }} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(await screen.findByText('AL')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('keeps a loaded primary photo visible while the fallback URL is still being prepared', () => {
    vi.stubGlobal('crypto', { subtle: { digest: () => new Promise(() => undefined) } });
    render(<UserInitialsAvatar item={{ ...user, email: 'ada@example.com' }} />);
    const image = screen.getByRole('img');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    fireEvent.load(image);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(image).toHaveAttribute('src', user.avatar);
  });

  it('uses Gravatar after an existing photo fails, then initials after Gravatar fails', async () => {
    render(<UserInitialsAvatar item={{ ...user, email: ' Ada@Example.com ' }} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', user.avatar);
    fireEvent.error(screen.getByRole('img'));
    const image = await screen.findByRole('img');
    await waitFor(() =>
      expect(image.getAttribute('src')).toMatch(/^https:\/\/gravatar.com\/avatar\/[a-f0-9]{64}\?s=96&r=g&d=404$/),
    );
    expect(image).toHaveAttribute('referrerPolicy', 'no-referrer');
    fireEvent.error(image);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('retries images when the user email or primary photo changes', async () => {
    const { rerender } = render(<UserInitialsAvatar item={{ ...user, avatar: '', email: 'ada@example.com' }} />);
    const image = await screen.findByRole('img');
    const oldUrl = image.getAttribute('src');
    fireEvent.error(image);
    expect(screen.getByText('AL')).toBeInTheDocument();
    rerender(<UserInitialsAvatar item={{ ...user, avatar: '', email: 'grace@example.com' }} />);
    const nextImage = await screen.findByRole('img');
    expect(nextImage.getAttribute('src')).not.toBe(oldUrl);
    fireEvent.error(nextImage);
    rerender(
      <UserInitialsAvatar item={{ ...user, avatar: 'https://cdn.example.com/new.png', email: 'grace@example.com' }} />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.example.com/new.png');
  });

  it.each([undefined, '', 'Unknown', 'not an email'])('keeps initials for invalid email %s', (email) => {
    render(<UserInitialsAvatar item={{ ...user, avatar: '', email }} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('renders the real avatar image when the user has one', () => {
    render(<UserInitialsAvatar item={user} />);

    const image = screen.getByRole('img', { name: user.fullName });
    expect(image).toHaveAttribute('src', user.avatar);
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('referrerPolicy', 'no-referrer');
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
  });

  it('renders initials and color when the user has no avatar', () => {
    render(<UserInitialsAvatar item={{ ...user, avatar: undefined }} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('falls back to initials when the avatar image fails to load', () => {
    render(<UserInitialsAvatar item={user} />);

    fireEvent.error(screen.getByRole('img', { name: user.fullName }));

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });
});
