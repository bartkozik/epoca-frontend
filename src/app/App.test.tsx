import { render } from '@testing-library/react';
import App from './App';

window.scrollTo = vi.fn();

describe(`App`, () => {
  afterAll(() => {
    vi.clearAllMocks();
  });

  it(`exists`, () => {
    const view = render(<App />);
    expect(view).toBeTruthy();
  });
});
