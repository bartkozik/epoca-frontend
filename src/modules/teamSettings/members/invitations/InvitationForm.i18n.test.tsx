import en from '@/core/i18n/locales/en/translation.json';
import pl from '@/core/i18n/locales/pl/translation.json';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import InvitationForm from './InvitationForm';
import type { InvitationCreate } from './models/invitationCreate.model';

const mocks = vi.hoisted(() => ({
  create: vi.fn<(input: { input: InvitationCreate }) => Promise<{ delivery: { status: string } }>>(),
  toast: vi.fn(),
}));
vi.mock('./hooks/useCreateInvitationMutation', () => ({
  useCreateInvitationMutation: () => ({ mutateAsync: mocks.create }),
}));
vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: mocks.toast }) }));

it.each([
  [
    'en',
    'Add team member',
    'First name',
    'Last name',
    'Email',
    'Create invitation',
    'Enter a name (1–200 characters).',
    'Invitation saved. Email delivery failed.',
  ],
  [
    'pl',
    'Dodaj członka zespołu',
    'Imię',
    'Nazwisko',
    'E-mail',
    'Utwórz zaproszenie',
    'Wpisz imię lub nazwisko (1–200 znaków).',
    'Zaproszenie zapisane. Nie udało się wysłać wiadomości.',
  ],
])(
  'renders and submits real %s translations and reports failed delivery honestly',
  async (language, title, firstName, lastName, email, submit, validation, delivery) => {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({
      lng: language,
      fallbackLng: 'en',
      resources: { en: { translation: en }, pl: { translation: pl } },
      keySeparator: false,
      interpolation: { escapeValue: false },
    });
    const user = userEvent.setup();
    mocks.create.mockResolvedValue({ delivery: { status: 'Failed' } });
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
          <InvitationForm isOpen organizationSlug="acme" onClose={vi.fn()} />
        </QueryClientProvider>
      </I18nextProvider>,
    );
    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: submit }));
    expect(screen.getAllByText(validation)).toHaveLength(2);
    await user.type(screen.getByLabelText(firstName), 'Ada');
    await user.type(screen.getByLabelText(lastName), 'Lovelace');
    await user.type(screen.getByLabelText(email), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: submit }));
    expect(mocks.create.mock.lastCall?.[0].input.locale).toBe(language);
    expect(mocks.toast).toHaveBeenLastCalledWith({ content: delivery, type: 'error' });
  },
);
