import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Checkbox from './Checkbox';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({ 'common.enabled': 'Enabled', 'common.disabled': 'Disabled' })[key] ?? key,
  }),
}));

describe('Checkbox', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes a named controlled input and invokes onClick once per mouse or Space action', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <Checkbox ariaLabel="Export report row" onClick={onClick} selected={false} variant="square" />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Export report row' });

    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(onClick).toHaveBeenCalledTimes(1);

    onClick.mockClear();
    checkbox.focus();
    await user.keyboard('[Space]');
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Checkbox ariaLabel="Export report row" onClick={onClick} selected variant="square" />);
    expect(checkbox).toBeChecked();
  });

  it('uses its visible label as the accessible-name fallback and invokes onClick once', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Checkbox label="Enable reminders" onClick={onClick} selected={false} />);

    expect(screen.getByRole('checkbox', { name: 'Enable reminders' })).not.toBeChecked();

    await user.click(screen.getByText('Enable reminders'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a selected decorative checkbox without React warnings or a tab stop', () => {
    const consoleError = vi.spyOn(console, 'error');

    render(<Checkbox ariaLabel="Selected option" selected />);

    expect(screen.getByRole('checkbox', { name: 'Selected option' })).toHaveAttribute('tabindex', '-1');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("invokes onClick once when Authentication's visible state text is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Checkbox ariaLabel="SAML authentication" onClick={onClick} selected={false} withStateText />);

    await user.click(screen.getByText('Disabled'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('names the current state next to the checkbox', () => {
    const { rerender } = render(
      <Checkbox ariaLabel="SAML authentication" onClick={vi.fn()} selected={false} withStateText />,
    );
    expect(screen.getByText('Disabled')).toBeInTheDocument();

    rerender(<Checkbox ariaLabel="SAML authentication" onClick={vi.fn()} selected withStateText />);
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });
});
