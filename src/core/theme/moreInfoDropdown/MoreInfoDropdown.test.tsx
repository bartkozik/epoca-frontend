import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MoreInfoDropdown from './MoreInfoDropdown';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => (key === 'common.more' ? 'More' : key) }),
}));

vi.mock('@/core/utils/hooks', () => ({ useOnClickOutside: vi.fn() }));

describe('MoreInfoDropdown actions', () => {
  it('keeps rendering item-only dropdowns without an actions slot', async () => {
    render(<MoreInfoDropdown items={[{ label: 'Project', value: 'Epoca' }]} />);

    await userEvent.click(screen.getByRole('button', { name: 'More' }));

    expect(screen.getByRole('listitem')).toHaveTextContent('Project: Epoca');
  });

  it('exposes actions inside the dropdown panel only after opening More', async () => {
    render(
      <MoreInfoDropdown items={[{ label: 'Project', value: 'Epoca' }]}>
        <button type="button">Classify</button>
      </MoreInfoDropdown>,
    );

    expect(screen.queryByRole('button', { name: 'Classify' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'More' }));

    expect(within(screen.getByRole('group', { name: 'More' })).getByRole('button', { name: 'Classify' })).toBeVisible();
  });
});
