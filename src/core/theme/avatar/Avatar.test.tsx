import { render, screen } from '@testing-library/react';
import Avatar from './Avatar';

describe('Avatar', () => {
  it('renders nothing when there is no user', () => {
    const { container } = render(<Avatar user={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the real avatar image instead of a placeholder when the user has one', () => {
    render(<Avatar user={{ id: 'user-1', fullName: 'Ada Lovelace', avatar: 'https://cdn.example.com/avatar.png' }} />);

    const image = screen.getByRole('img', { name: 'Ada Lovelace' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/avatar.png');
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('falls back to initials when the user has no avatar', () => {
    render(<Avatar user={{ id: 'user-1', fullName: 'Ada Lovelace' }} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('displays the email when fullName is missing', () => {
    render(<Avatar user={{ id: 'user-1', email: 'ada@example.com' }} />);

    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });
});
