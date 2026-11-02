import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IconButton from './IconButton';

describe('IconButton disabled state', () => {
  it('uses the native disabled state and ignores keyboard activation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton disabled icon={<span>icon</span>} label="Edit" onClick={onClick} variant="contained" />);

    const button = screen.getByRole('button', { name: /edit/i });
    expect(button).toBeDisabled();

    button.focus();
    await user.keyboard('{Enter}');

    expect(onClick).not.toHaveBeenCalled();
  });
});
