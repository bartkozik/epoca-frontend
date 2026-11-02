import { ReportDateRangeSnapshot } from '@/modules/reports/filterPanel/reportDateRange';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs, { Dayjs } from 'dayjs';
import type { Mock } from 'vitest';
import { useReportDateRangeURL } from './useReportDateRangeURL';

const TODAY = dayjs('2026-07-29T23:59:59');

const snapshotText = (snapshot: ReportDateRangeSnapshot): string =>
  [
    snapshot.fromDate.format('YYYY-MM-DD'),
    snapshot.toDate?.format('YYYY-MM-DD') ?? 'open',
    snapshot.navigationMode,
    snapshot.today.format('YYYY-MM-DD'),
  ].join(':');

interface HarnessProps {
  onHydrate: (snapshot: ReportDateRangeSnapshot) => void;
  today: () => Dayjs;
}

const Harness = ({ onHydrate, today }: HarnessProps): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const { replaceDateRange } = useReportDateRangeURL({ onHydrate, today });

  const replace = (
    fromDate: string,
    toDate: string | null,
    navigationMode: ReportDateRangeSnapshot['navigationMode'],
  ): void => {
    replaceDateRange({
      fromDate: dayjs(fromDate),
      navigationMode,
      toDate: toDate ? dayjs(toDate) : null,
      today: TODAY,
    });
  };

  return (
    <>
      <output>{location.search}</output>
      <button onClick={() => replace('2026-08-10', '2026-08-20', 'fixed-length')}>replace closed</button>
      <button onClick={() => replace('2026-08-01', '2026-08-31', 'fixed-length')}>replace ambiguous</button>
      <button onClick={() => replace('2026-08-01', '2026-08-31', 'full-month')}>replace full month</button>
      <button onClick={() => replace('2026-08-10', '2026-08-20', 'fixed-length')}>replace custom</button>
      <button onClick={() => replace('2026-08-01', null, 'fixed-length')}>replace open</button>
      <button onClick={() => navigate(-1)}>back</button>
    </>
  );
};

interface RenderHarnessOptions {
  entries: string[];
  onHydrate?: Mock<(arg: ReportDateRangeSnapshot) => void>;
  strictMode?: boolean;
  today?: Mock<() => Dayjs>;
}

const renderHarness = ({
  entries,
  onHydrate = vi.fn<(arg: ReportDateRangeSnapshot) => void>(),
  strictMode = false,
  today = vi.fn(() => TODAY),
}: RenderHarnessOptions): {
  onHydrate: Mock<(arg: ReportDateRangeSnapshot) => void>;
  today: Mock<() => Dayjs>;
} => {
  const router = (
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/reports" element={<Harness onHydrate={onHydrate} today={today} />} />
      </Routes>
    </MemoryRouter>
  );

  render(strictMode ? <React.StrictMode>{router}</React.StrictMode> : router);

  return { onHydrate, today };
};

const getCurrentParams = (): URLSearchParams =>
  new URLSearchParams(screen.getByRole('status').textContent?.replace(/^\?/, '') ?? '');

describe('useReportDateRangeURL', () => {
  it('hydrates a canonical initial URL once under React StrictMode effect replay', async () => {
    const { onHydrate, today } = renderHarness({
      entries: ['/reports?startDate=2026-07-10&endDate=2026-07-20'],
      strictMode: true,
    });

    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(1));

    expect(getCurrentParams().toString()).toBe('startDate=2026-07-10&endDate=2026-07-20');
    expect(today).toHaveBeenCalledTimes(1);
  });

  it('canonicalizes a missing initial range once under React StrictMode without replay hydration', async () => {
    const { onHydrate, today } = renderHarness({
      entries: ['/reports?clients=client-1&endDate=2026-07-20&navigationMode=unknown'],
      strictMode: true,
    });

    await waitFor(() => expect(getCurrentParams().get('startDate')).toBe('2026-07-01'));

    expect(getCurrentParams().get('clients')).toBe('client-1');
    expect(getCurrentParams().get('endDate')).toBe('2026-07-31');
    expect(getCurrentParams().get('navigationMode')).toBeNull();
    expect(onHydrate).toHaveBeenCalledTimes(1);
    expect(today).toHaveBeenCalledTimes(1);
  });

  it('hydrates an initially valid range exactly once', async () => {
    const { onHydrate, today } = renderHarness({
      entries: ['/reports?startDate=2026-07-10&endDate=2026-07-20'],
    });

    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(1));

    expect(snapshotText(onHydrate.mock.calls[0][0])).toBe('2026-07-10:2026-07-20:fixed-length:2026-07-29');
    expect(today).toHaveBeenCalledTimes(1);
    expect(getCurrentParams().toString()).toBe('startDate=2026-07-10&endDate=2026-07-20');
  });

  it.each(['/reports', '/reports?startDate=invalid&endDate=2026-07-20'])(
    'defaults and canonicalizes %s without duplicate hydration',
    async (entry) => {
      const { onHydrate, today } = renderHarness({ entries: [entry] });

      await waitFor(() => expect(getCurrentParams().get('startDate')).toBe('2026-07-01'));

      expect(snapshotText(onHydrate.mock.calls[0][0])).toBe('2026-07-01:2026-07-31:full-month:2026-07-29');
      expect(onHydrate).toHaveBeenCalledTimes(1);
      expect(today).toHaveBeenCalledTimes(1);
      expect(getCurrentParams().get('endDate')).toBe('2026-07-31');
      expect(getCurrentParams().get('navigationMode')).toBeNull();
    },
  );

  it.each([
    ['invalid', 'not-a-date'],
    ['empty', ''],
  ])('preserves a valid start with an %s end and canonicalizes exactly once', async (_name, endDate) => {
    const { onHydrate, today } = renderHarness({
      entries: [`/reports?clients=client-1&startDate=2026-07-10&endDate=${endDate}`],
    });

    await waitFor(() => expect(getCurrentParams().get('endDate')).toBeNull());

    expect(snapshotText(onHydrate.mock.calls[0][0])).toBe('2026-07-10:open:fixed-length:2026-07-29');
    expect(getCurrentParams().get('startDate')).toBe('2026-07-10');
    expect(getCurrentParams().get('clients')).toBe('client-1');
    expect(getCurrentParams().get('navigationMode')).toBeNull();
    expect(onHydrate).toHaveBeenCalledTimes(1);
    expect(today).toHaveBeenCalledTimes(1);
  });

  it('defaults a future open URL once and preserves unrelated filters', async () => {
    const { onHydrate, today } = renderHarness({
      entries: ['/reports?clients=client-1&startDate=2026-08-10&endDate=not-a-date&navigationMode=sideways'],
    });

    await waitFor(() => expect(getCurrentParams().get('startDate')).toBe('2026-07-01'));

    expect(snapshotText(onHydrate.mock.calls[0][0])).toBe('2026-07-01:2026-07-31:full-month:2026-07-29');
    expect(getCurrentParams().get('clients')).toBe('client-1');
    expect(getCurrentParams().get('endDate')).toBe('2026-07-31');
    expect(getCurrentParams().get('navigationMode')).toBeNull();
    expect(onHydrate).toHaveBeenCalledTimes(1);
    expect(today).toHaveBeenCalledTimes(1);
  });

  it('preserves unrelated filters while canonicalizing the owned date params', async () => {
    const { onHydrate } = renderHarness({
      entries: [
        '/reports?clients=client-1%2Cclient-2&startDate=invalid&endDate=also-invalid&users=user-1&navigationMode=unknown',
      ],
    });

    await waitFor(() => expect(getCurrentParams().get('startDate')).toBe('2026-07-01'));

    expect(onHydrate).toHaveBeenCalledTimes(1);
    expect(getCurrentParams().get('clients')).toBe('client-1,client-2');
    expect(getCurrentParams().get('users')).toBe('user-1');
    expect(getCurrentParams().get('endDate')).toBe('2026-07-31');
    expect(getCurrentParams().get('navigationMode')).toBeNull();
  });

  it('replaces a closed range atomically without rehydrating and preserves unrelated params', async () => {
    const user = userEvent.setup();
    const { onHydrate } = renderHarness({
      entries: ['/reports?clients=client-1&startDate=2026-07-01&endDate=2026-07-31'],
    });
    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'replace closed' }));

    await waitFor(() => expect(getCurrentParams().get('startDate')).toBe('2026-08-10'));
    expect(getCurrentParams().get('endDate')).toBe('2026-08-20');
    expect(getCurrentParams().get('clients')).toBe('client-1');
    expect(onHydrate).toHaveBeenCalledTimes(1);
  });

  it('adds a fixed-length marker when replacing with an ambiguous closed range', async () => {
    const user = userEvent.setup();
    const { onHydrate } = renderHarness({
      entries: ['/reports?startDate=2026-07-01&endDate=2026-07-31'],
    });
    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'replace ambiguous' }));

    await waitFor(() => expect(getCurrentParams().get('startDate')).toBe('2026-08-01'));
    expect(getCurrentParams().get('endDate')).toBe('2026-08-31');
    expect(getCurrentParams().get('navigationMode')).toBe('fixed-length');
    expect(onHydrate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ordinary full-month', 'replace full month', '2026-08-01', '2026-08-31', null],
    ['custom', 'replace custom', '2026-08-10', '2026-08-20', null],
    ['open', 'replace open', '2026-08-01', null, 'fixed-length'],
  ])(
    'serializes the navigation marker when replacing with an %s range',
    async (_name, buttonName, expectedStartDate, expectedEndDate, expectedMode) => {
      const user = userEvent.setup();
      const { onHydrate } = renderHarness({
        entries: ['/reports?startDate=2026-07-01&endDate=2026-07-31&navigationMode=fixed-length&projects=project-1'],
      });
      await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(1));
      expect(getCurrentParams().get('navigationMode')).toBe('fixed-length');

      await user.click(screen.getByRole('button', { name: buttonName }));

      await waitFor(() => expect(getCurrentParams().get('startDate')).toBe(expectedStartDate));
      expect(getCurrentParams().get('endDate')).toBe(expectedEndDate);
      expect(getCurrentParams().get('navigationMode')).toBe(expectedMode);
      expect(getCurrentParams().get('projects')).toBe('project-1');
      expect(onHydrate).toHaveBeenCalledTimes(1);
    },
  );

  it('hydrates a POP location exactly once and restores its ambiguous fixed-length mode', async () => {
    const user = userEvent.setup();
    const { onHydrate, today } = renderHarness({
      entries: [
        '/reports?startDate=2026-06-01&endDate=2026-06-30&navigationMode=fixed-length',
        '/reports?startDate=2026-07-01&endDate=2026-07-31',
      ],
    });
    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'back' }));

    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(2));
    expect(snapshotText(onHydrate.mock.calls[1][0])).toBe('2026-06-01:2026-06-30:fixed-length:2026-07-29');
    expect(onHydrate).toHaveBeenCalledTimes(2);
    expect(today).toHaveBeenCalledTimes(2);
    expect(getCurrentParams().get('navigationMode')).toBe('fixed-length');
  });

  it('hydrates and canonicalizes an invalid POP location once without replaying after REPLACE', async () => {
    const user = userEvent.setup();
    const { onHydrate, today } = renderHarness({
      entries: [
        '/reports?projects=project-1&startDate=invalid&endDate=2026-06-20&navigationMode=unknown',
        '/reports?startDate=2026-07-01&endDate=2026-07-31',
      ],
    });
    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'back' }));

    await waitFor(() => expect(getCurrentParams().get('projects')).toBe('project-1'));

    expect(getCurrentParams().get('startDate')).toBe('2026-07-01');
    expect(getCurrentParams().get('endDate')).toBe('2026-07-31');
    expect(getCurrentParams().get('navigationMode')).toBeNull();
    expect(onHydrate).toHaveBeenCalledTimes(2);
    expect(today).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['unknown', '/reports?startDate=2026-07-01&endDate=2026-07-31&navigationMode=sideways', 'full-month'],
    ['inconsistent', '/reports?startDate=2026-07-10&endDate=2026-07-20&navigationMode=fixed-length', 'fixed-length'],
  ])('removes an %s navigation marker during canonicalization', async (_name, entry, expectedMode) => {
    const { onHydrate } = renderHarness({ entries: [entry] });

    await waitFor(() => expect(getCurrentParams().get('navigationMode')).toBeNull());

    expect(onHydrate).toHaveBeenCalledTimes(1);
    expect(onHydrate.mock.calls[0][0].navigationMode).toBe(expectedMode);
  });
});
