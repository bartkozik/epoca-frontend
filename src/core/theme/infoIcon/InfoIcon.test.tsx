import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InfoIcon from './InfoIcon';

describe('InfoIcon', () => {
  it('uses an inline trigger inside the shared inline tooltip wrapper', () => {
    render(<InfoIcon tooltipText="Project details" />);

    expect(screen.getByText('i', { selector: 'span > span' })).toBeInTheDocument();
  });

  it('keeps its icon and tooltip text while using the shared interaction contract', async () => {
    const user = userEvent.setup();
    render(<InfoIcon iconClassName="custom-icon" isClickable tooltipText="Project details" />);

    const trigger = screen.getByText('i');
    expect(trigger).toHaveClass('custom-icon');

    await user.hover(trigger);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Project details');
    expect(tooltip).toHaveAttribute('data-placement', 'bottom');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);

    await user.unhover(trigger);
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('tooltip')).toBeVisible();
  });
});
