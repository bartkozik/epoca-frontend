import { render, screen } from '@testing-library/react';
import Input from './Input';

it('preserves the default labeled textbox behavior', () => {
  render(<Input label="Company" name="company" value="Acme" readOnly />);
  expect(screen.getByRole('textbox', { name: 'Company' })).toHaveValue('Acme');
  expect(screen.getByLabelText('Company')).not.toHaveAttribute('aria-expanded');
});

it('forwards typed combobox semantics to the actual input', () => {
  render(
    <Input
      label="Mode"
      name="mode"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded
      aria-controls="modes"
      aria-activedescendant="mode-1"
      aria-disabled={false}
    />,
  );
  const input = screen.getByRole('combobox', { name: 'Mode' });
  expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(input).toHaveAttribute('aria-haspopup', 'listbox');
  expect(input).toHaveAttribute('aria-controls', 'modes');
  expect(input).toHaveAttribute('aria-activedescendant', 'mode-1');
  expect(input).toHaveAttribute('aria-disabled', 'false');
});
