import { Language } from '@/core/models/types';
import { useSamlConfigQuery, useUpdateSamlConfigMutation } from '@/modules/ssoAuth';
import { fireEvent, render, screen } from '@testing-library/react';
import type { MockedFunction } from 'vitest';
import Authentication from './Authentication';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/modules/ssoAuth', () => ({
  useSamlConfigQuery: vi.fn(),
  useUpdateSamlConfigMutation: vi.fn(),
}));

const useSamlConfigQueryMock = useSamlConfigQuery as MockedFunction<typeof useSamlConfigQuery>;
const useUpdateSamlConfigMutationMock = useUpdateSamlConfigMutation as MockedFunction<
  typeof useUpdateSamlConfigMutation
>;
const mutateMock = vi.fn();

const rawSamlConfig = {
  allowAccountInit: false,
  createdAt: '2026-01-01T00:00:00Z',
  idpCert: 'original-cert',
  idpEntityId: 'entity-1',
  idpSsoUrl: 'https://idp.example.com/sso',
  isEnabled: true,
  langCode: Language.English,
  organizationId: 'org-1',
  validFor: 'PT1H',
};

const renderAuthentication = (data: typeof rawSamlConfig | undefined): void => {
  useSamlConfigQueryMock.mockReturnValue({ data, isLoading: false, error: null } as never);
  useUpdateSamlConfigMutationMock.mockReturnValue({ mutate: mutateMock, isPending: false } as never);

  render(<Authentication />);
};

describe('Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing until the SAML config has loaded', () => {
    renderAuthentication(undefined);

    expect(screen.queryByText('team_seatings.authentication.header.saml_integration')).not.toBeInTheDocument();
  });

  it('renders the form seeded from the fetched SAML config once it loads', () => {
    renderAuthentication(rawSamlConfig);

    expect(screen.getByDisplayValue('original-cert')).toBeInTheDocument();
    expect(screen.getByDisplayValue('entity-1')).toBeInTheDocument();
  });

  it('submits the edited draft, converting the human-readable duration back to ISO', () => {
    renderAuthentication(rawSamlConfig);

    fireEvent.change(screen.getByDisplayValue('original-cert'), { target: { value: 'updated-cert' } });
    fireEvent.click(screen.getByText('common.save'));

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ idpCert: 'updated-cert', validFor: expect.any(String) as string }),
      expect.objectContaining({ onSuccess: expect.any(Function) as unknown }),
    );
  });

  // Regression test for the fix that stopped a background refetch from silently discarding an
  // in-progress edit: the draft is seeded from query data only once (draft === null), never again
  // just because the query's data reference changes.
  it('does not overwrite an in-progress edit when the query refetches in the background', () => {
    const { rerender } = render(<Authentication />);
    useSamlConfigQueryMock.mockReturnValue({ data: rawSamlConfig, isLoading: false, error: null } as never);
    useUpdateSamlConfigMutationMock.mockReturnValue({ mutate: mutateMock, isPending: false } as never);
    rerender(<Authentication />);

    fireEvent.change(screen.getByDisplayValue('original-cert'), { target: { value: 'still-editing' } });

    // Simulate a background refetch returning a *different* server value while the admin is
    // mid-edit -- a new object reference for samlConfigQuery.data.
    useSamlConfigQueryMock.mockReturnValue({
      data: { ...rawSamlConfig, idpCert: 'someone-else-changed-this' },
      isLoading: false,
      error: null,
    } as never);
    rerender(<Authentication />);

    expect(screen.getByDisplayValue('still-editing')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('someone-else-changed-this')).not.toBeInTheDocument();
  });
});
