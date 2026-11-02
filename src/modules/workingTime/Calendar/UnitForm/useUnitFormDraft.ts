import { DATE_FORMAT } from '@/core/utils/helpers';
import { useUnitWorkspace } from '@/modules/workingTime/UnitWorkspaceProvider';
import { useEffect, useRef } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import type { UnitFormProps } from './types';

interface DraftOptions extends Pick<UnitFormProps, 'unit' | 'editAdapter' | 'onDirtyChange'> {
  selectedDay: Dayjs;
  setSelectedDay: (day: Dayjs) => void;
  dateInputValue: string;
  setDateInputValue: (value: string) => void;
}

export function useUnitFormDraft({
  unit,
  editAdapter,
  selectedDay,
  setSelectedDay,
  dateInputValue,
  setDateInputValue,
  onDirtyChange,
}: DraftOptions): void {
  const unitWorkspace = useUnitWorkspace();
  const {
    initializeUnitFormData,
    getCurrentSnapshot,
    setReportedHours,
    setUnitDescription,
    selectedClientAndProject,
    selectedEntryType,
    reportedHours,
    unitDescription,
    taskId,
  } = unitWorkspace;
  const draftSnapshot = (): string => {
    const current = getCurrentSnapshot();
    return JSON.stringify([
      current.selectedClientAndProject?.projectId,
      current.selectedEntryType,
      current.reportedHours,
      current.unitDescription,
      current.taskId,
      selectedDay.format('YYYY-MM-DD'),
      dateInputValue,
    ]);
  };
  const initialDraft = useRef<string | null>(null);
  const sourceBaseline = useRef(editAdapter?.sourceSnapshot);

  useEffect(() => {
    if (unit) initializeUnitFormData(unit);
    initialDraft.current = draftSnapshot();
  }, [unit]);

  useEffect(() => {
    initialDraft.current = draftSnapshot();
    if (editAdapter)
      sourceBaseline.current = {
        date: selectedDay.format('YYYY-MM-DD'),
        duration: unitWorkspace.reportedHours,
        description: unitWorkspace.unitDescription,
      };
  }, [editAdapter?.savedVersion]);

  useEffect(() => {
    const next = editAdapter?.sourceSnapshot;
    const previous = sourceBaseline.current;
    if (!next || !previous || next === previous) return;
    const previousDay = dayjs(previous.date);
    const nextDay = dayjs(next.date);
    const current = getCurrentSnapshot();
    if (current.reportedHours === previous.duration) setReportedHours(next.duration);
    if (current.unitDescription === previous.description) setUnitDescription(next.description);
    if (selectedDay.isSame(previousDay, 'day') && dateInputValue === previousDay.format(DATE_FORMAT.DAY_WITH_DOT)) {
      setSelectedDay(nextDay);
      setDateInputValue(nextDay.format(DATE_FORMAT.DAY_WITH_DOT));
    }
    sourceBaseline.current = next;
    initialDraft.current = JSON.stringify([
      current.selectedClientAndProject?.projectId,
      current.selectedEntryType,
      next.duration,
      next.description,
      current.taskId,
      nextDay.format('YYYY-MM-DD'),
      nextDay.format(DATE_FORMAT.DAY_WITH_DOT),
    ]);
  }, [editAdapter?.sourceSnapshot]);

  useEffect(() => {
    onDirtyChange?.(initialDraft.current !== draftSnapshot());
  }, [
    selectedClientAndProject,
    selectedEntryType,
    reportedHours,
    unitDescription,
    taskId,
    selectedDay,
    dateInputValue,
    onDirtyChange,
  ]);
}
