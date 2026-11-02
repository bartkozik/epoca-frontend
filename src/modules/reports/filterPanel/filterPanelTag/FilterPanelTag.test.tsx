import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterPanelTag from './FilterPanelTag';

describe('FilterPanelTag', () => {
  it('shows the category and the selected value', () => {
    render(
      <FilterPanelTag category="User" value="Adam Jankowski +1" removeLabel="Remove user filter" onRemove={vi.fn()} />,
    );

    expect(screen.getByTitle('User: Adam Jankowski +1')).toHaveTextContent('User: Adam Jankowski +1');
  });

  it('removes the filter only from its remove button, also by keyboard', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <FilterPanelTag
        category="Client"
        value="Atelier Operations"
        removeLabel="Remove client filter"
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByText('Atelier Operations'));
    expect(onRemove).not.toHaveBeenCalled();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Remove client filter' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
