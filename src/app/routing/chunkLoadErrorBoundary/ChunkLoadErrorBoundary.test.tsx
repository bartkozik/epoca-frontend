import i18n from '@/core/i18n/i18n';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import ChunkLoadErrorBoundary from './ChunkLoadErrorBoundary';

// Real MemoryRouter/i18n (not mocks) so this also proves the message resolves through the app's
// real i18n instance, not just that some string renders.

const ThrowChunkError = (): null => {
  throw new Error('Failed to fetch dynamically imported module: https://example.com/chunk.js');
};

const ThrowGenericError = (): null => {
  throw new Error('something else broke');
};

describe('ChunkLoadErrorBoundary', () => {
  it('renders the chunk-load fallback for a dynamic-import failure', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ChunkLoadErrorBoundary>
            <ThrowChunkError />
          </ChunkLoadErrorBoundary>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByText('A new version of Época is available. Reload to continue.')).toBeInTheDocument();
  });

  it('re-throws a non-chunk-load error instead of swallowing it', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <ChunkLoadErrorBoundary>
            <ThrowGenericError />
          </ChunkLoadErrorBoundary>
        </MemoryRouter>,
      ),
    ).toThrow('something else broke');
  });
});
