import { OrganizationUserRole } from '@/modules/organizations/types';
import { ReportsViewTabs } from '@/modules/reports/types';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import ReportsTabs from './ReportsTabs';

let currentRole: OrganizationUserRole;
vi.mock('@/modules/auth/AuthProvider', () => ({
  useAuth: () => ({ hasAccess: (allowedRoles: OrganizationUserRole[]) => allowedRoles.includes(currentRole) }),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const renderTabs = (role: OrganizationUserRole): void => {
  currentRole = role;

  render(
    <MemoryRouter initialEntries={['/report?clients=c1&startDate=2026-07-01']}>
      <ReportsTabs selectedTab={ReportsViewTabs.report} />
    </MemoryRouter>,
  );
};

describe('ReportsTabs', () => {
  it.each([OrganizationUserRole.Owner, OrganizationUserRole.Manager])(
    'shows report and pivot links with the current query for %s',
    (role) => {
      renderTabs(role);

      expect(screen.getByRole('link', { name: 'common.report' })).toHaveAttribute(
        'href',
        '/report?clients=c1&startDate=2026-07-01',
      );
      expect(screen.getByRole('link', { name: 'common.pivotTable' })).toHaveAttribute(
        'href',
        '/pivot-table?clients=c1&startDate=2026-07-01',
      );
    },
  );

  it('keeps the pivot rows, columns and values on the pivot link only and shows extra controls after the tabs', () => {
    currentRole = OrganizationUserRole.Owner;
    render(
      <MemoryRouter
        initialEntries={['/pivot-table?startDate=2026-07-01&rows=UserKey&columns=MonthYearKey&values=DurationSum']}
      >
        <ReportsTabs selectedTab={ReportsViewTabs.pivotTable}>
          <button type="button">preset control</button>
        </ReportsTabs>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'common.report' })).toHaveAttribute('href', '/report?startDate=2026-07-01');
    expect(screen.getByRole('link', { name: 'common.pivotTable' })).toHaveAttribute(
      'href',
      '/pivot-table?startDate=2026-07-01&rows=UserKey&columns=MonthYearKey&values=DurationSum',
    );
    expect(screen.getByRole('button', { name: 'preset control' })).toBeInTheDocument();
  });

  it.each([OrganizationUserRole.Employee, OrganizationUserRole.External])('hides the pivot link for %s', (role) => {
    renderTabs(role);

    expect(screen.getByRole('link', { name: 'common.report' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'common.pivotTable' })).not.toBeInTheDocument();
  });
});
