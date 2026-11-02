import { render, screen } from '@testing-library/react';
import Button from './Button';

describe('Button accessibility state', () => {
  it('keeps an explicit accessible name while loading replaces visible content', () => {
    const view = render(<Button aria-label="Export XLSX" label="XLSX" loading />);

    expect(screen.getByRole('button', { name: 'Export XLSX' })).not.toHaveTextContent('XLSX');

    view.rerender(<Button aria-label="Export XLSX" label="XLSX" loading={false} />);
    expect(screen.getByRole('button', { name: 'Export XLSX' })).toHaveTextContent('XLSX');
  });

  it('forwards the pressed state to the native button', () => {
    render(<Button ariaPressed label="PM Filters" />);

    expect(screen.getByRole('button', { name: 'PM Filters' })).toHaveAttribute('aria-pressed', 'true');
  });
});
