import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import ScrolledContainer from './ScrolledContainer';

describe('ScrolledContainer', () => {
  it('forwards its DOM node ref', () => {
    const ref = createRef<HTMLDivElement>();

    render(
      <ScrolledContainer ref={ref}>
        <span data-testid="content">content</span>
      </ScrolledContainer>,
    );

    expect(ref.current).toContainElement(screen.getByTestId('content'));
  });
});
