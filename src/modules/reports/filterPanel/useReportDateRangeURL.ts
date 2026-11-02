import {
  parseReportDateRange,
  ReportDateRangeSnapshot,
  serializeReportDateRange,
} from '@/modules/reports/filterPanel/reportDateRange';
import { useCallback, useEffect, useRef } from 'react';
import { NavigationType, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';

export interface UseReportDateRangeURLProps {
  onHydrate: (snapshot: ReportDateRangeSnapshot) => void;
  today?: () => Dayjs;
}

export interface UseReportDateRangeURLReturn {
  replaceDateRange: (snapshot: ReportDateRangeSnapshot) => void;
}

const captureLocalToday = (): Dayjs => dayjs();

const withSerializedDateRange = (
  currentParams: URLSearchParams,
  snapshot: ReportDateRangeSnapshot,
): URLSearchParams => {
  const nextParams = new URLSearchParams(currentParams.toString());
  const serialized = serializeReportDateRange(snapshot);

  nextParams.set('startDate', serialized.startDate);

  if (serialized.endDate) nextParams.set('endDate', serialized.endDate);
  else nextParams.delete('endDate');

  if (serialized.navigationMode) nextParams.set('navigationMode', serialized.navigationMode);
  else nextParams.delete('navigationMode');

  return nextParams;
};

export const useReportDateRangeURL = ({
  onHydrate,
  today = captureLocalToday,
}: UseReportDateRangeURLProps): UseReportDateRangeURLReturn => {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const hydratedLocationKeyRef = useRef<string | null>(null);
  const onHydrateRef = useRef(onHydrate);
  const todayRef = useRef(today);

  onHydrateRef.current = onHydrate;
  todayRef.current = today;

  const replaceDateRange = useCallback(
    (snapshot: ReportDateRangeSnapshot): void => {
      const nextParams = withSerializedDateRange(new URLSearchParams(location.search), snapshot);
      navigate({ search: nextParams.toString() }, { replace: true });
    },
    [location.search, navigate],
  );

  useEffect(() => {
    const isInitialHydration = hydratedLocationKeyRef.current === null;
    const isNewPopLocation = navigationType === NavigationType.Pop && hydratedLocationKeyRef.current !== location.key;

    if (!isInitialHydration && !isNewPopLocation) return;

    hydratedLocationKeyRef.current = location.key;

    const currentParams = new URLSearchParams(location.search);
    const capturedToday = todayRef.current();
    const snapshot = parseReportDateRange(currentParams, capturedToday);
    const canonicalParams = withSerializedDateRange(currentParams, snapshot);

    onHydrateRef.current(snapshot);

    if (canonicalParams.toString() !== currentParams.toString()) {
      navigate({ search: canonicalParams.toString() }, { replace: true });
    }
  }, [location.key, location.search, navigate, navigationType]);

  return { replaceDateRange };
};
