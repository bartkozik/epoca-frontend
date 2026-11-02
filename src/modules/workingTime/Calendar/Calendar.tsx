import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { useToast } from '@/core/providers/toastProvider';
import Button from '@/core/theme/button';
import Confirmation, { ConfirmationAction } from '@/core/theme/confirmation';
import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import Modal from '@/core/theme/modal';
import {
  convertIsoDurationToHours,
  convertTimeFormat,
  formatDateDay,
  formatDateWeekday,
  getCorrelationIdFromError,
  isDateAfterToday,
  isSameDay,
  isSameWeek,
  isSmallScreen,
  isTodayDate,
  showToastForError,
} from '@/core/utils/helpers';
import useWindowSize from '@/core/utils/hooks/useWindowSize';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useDeleteUnitMutation } from '@/modules/workingTime/hooks/useDeleteUnitMutation';
import {
  computeAppendNewUnitPlan,
  useAppendNewUnitMutation,
  useMoveUnitToDateMutation,
  useReorderUnitsMutation,
} from '@/modules/workingTime/hooks/useReorderMutation';
import { selectModeledUnits, useUnitsQuery } from '@/modules/workingTime/hooks/useUnitsQuery';
import { RawUnit, Unit, WorkUnitEntryType } from '@/modules/workingTime/types';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import isToday from 'dayjs/plugin/isToday';
import { showUnitDeleteErrorToast } from '../showUnitDeleteErrorToast';
import { buildMainUnitsDto, isReportedMinimumHoursForDay } from '../unitCalculations';
import { useUnitWorkspace } from '../UnitWorkspaceProvider';
import styles from './Calendar.module.scss';
import DraggableUnit from './DraggableUnit';
import DroppableUnitArea from './DroppableUnitArea';
import UnitForm from './UnitForm';
import type { UseWorkUnitSubmissionResult } from './UnitForm/useWorkUnitSubmission';

dayjs.extend(isToday);
dayjs.extend(isoWeek);

interface UnitDragData {
  type: 'Unit';
  unit: Unit;
}

const isUnitDragData = (data: unknown): data is UnitDragData => {
  if (typeof data !== 'object' || data === null) return false;
  const candidate = data as Record<string, unknown>;
  return candidate.type === 'Unit' && typeof candidate.unit === 'object' && candidate.unit !== null;
};

interface CalendarProps {
  dates: Date[];
  weekStart: string;
  weekEnd: string;
  submission: UseWorkUnitSubmissionResult;
}

function Calendar({ dates, weekStart, weekEnd, submission }: CalendarProps): JSX.Element {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const workspace = useWorkspace();
  const auth = useAuth();
  const { hasAccess, loggedInUser } = auth;
  const { closeModal, handleDeleteConfirmationCancel, handleUnitAddFormOpen, modalConfig } = useUnitWorkspace();

  // Built through the shared buildMainUnitsDto helper (not a hand-built literal) so this resolves
  // to the same cache entry as WorkingTime.tsx's own mainUnitsDto.
  const dto = buildMainUnitsDto(weekStart, weekEnd, loggedInUser ? [loggedInUser.id] : []);
  const unitsQuery = useUnitsQuery(dto, { enabled: Boolean(loggedInUser) });
  const units = selectModeledUnits(unitsQuery.data, workspace.contextOrganizationUsers);

  const moveUnitToDateMutation = useMoveUnitToDateMutation(dto);
  const reorderUnitsMutation = useReorderUnitsMutation(dto);
  const deleteUnitMutation = useDeleteUnitMutation();
  const appendNewUnitMutation = useAppendNewUnitMutation();

  const weekUnits = units.filter((unit) => isSameWeek(unit.date, dates[0]));

  const [currentDate, setCurrentDate] = useState(() => {
    const todaysDate = dates.find(isTodayDate);
    return todaysDate || dates[0];
  });

  const [width] = useWindowSize();
  const smallScreen = isSmallScreen(width);
  const datesToShow = smallScreen ? [currentDate] : dates;

  useEffect(() => {
    const todaysDate = dates.find(isTodayDate);
    setCurrentDate(todaysDate || dates[0]);
  }, [dates]);

  const setCurrentDateToPrevDay = (): void => {
    const indexOfDate = dates.findIndex((date) => date.getDay() === currentDate.getDay());

    if (indexOfDate > 0) {
      setCurrentDate(dates[indexOfDate - 1]);
    } else {
      throw new Error(t('working_time.calendar.error.previous_day'));
    }
  };

  const setCurrentDateToNextDay = (): void => {
    const indexOfDate = dates.findIndex((date) => date.getDay() === currentDate.getDay());

    if (indexOfDate < dates.length - 1) {
      setCurrentDate(dates[indexOfDate + 1]);
    } else {
      throw new Error(t('working_time.calendar.error.next_day'));
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const [activeDraggedUnit, setActiveDraggedUnit] = useState<Unit | null>(null);
  const [dragEndDate, setDragEndDate] = useState<string | null>(null);
  const [dragStartDate, setDragStartDate] = useState<string | null>(null);

  const handleOnDragStart = (event: DragStartEvent): void => {
    const { active } = event;
    const dragData = active.data.current;

    // dnd-kit's `Active.data` is untyped -- this guard is what actually protects against a
    // mismatched/null-unit payload even though it should always pass for a real drag; don't remove
    // it as "redundant".
    if (!isUnitDragData(dragData)) return;

    setActiveDraggedUnit(dragData.unit);
    setDragStartDate(dragData.unit.date);
  };

  // The reorder/move mutations only restore the optimistic cache snapshot on error and otherwise
  // say nothing -- surface it here instead.
  const showReorderErrorToast = (error: unknown): void => {
    showToastForError({
      errorMessageMap: {
        404: t('toast_message.working_time.update_order_authorization_error'),
        default: t('toast_message.working_time.update_order_error'),
      },
      error,
    });
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveDraggedUnit(null);
    setDragEndDate(null);
    setDragStartDate(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    const isOverAColumn = over.data.current?.type === 'Column';

    if (activeId === overId) return;

    if (isOverAColumn) {
      const newDate = new Date(overId);

      if (dayjs(newDate).isAfter(dayjs())) return;

      moveUnitToDateMutation.mutate({ unitId: activeId, newDate }, { onError: showReorderErrorToast });
    } else reorderUnitsMutation.mutate({ activeId, overId }, { onError: showReorderErrorToast });
  };

  function handleDragOver(event: DragOverEvent): void {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id.toString();

    const isActiveATask = active.data.current?.type === 'Task';

    setDragEndDate(overId);

    if (activeId === overId || !isActiveATask) return;
  }

  const handleConfirmDelete = (): void => {
    if (modalConfig.type !== 'deleteConfirmation') return;

    deleteUnitMutation.mutate(
      { workUnitId: modalConfig.unit.id },
      {
        onSuccess: () => {
          addToast({ content: t('toast_message.calendar.report_delete') });
          closeModal();
        },
        onError: (err) => showUnitDeleteErrorToast(err, getCorrelationIdFromError(err), addToast),
      },
    );
  };

  const confirmationActions: ConfirmationAction[] = [{ text: t('common.delete'), action: handleConfirmDelete }];

  const restrictedAccess = !hasAccess(ROLE_PERMISSIONS.Internal);

  // The Modal's X button/click-outside call `close` directly, bypassing UnitForm's own reset --
  // without this, isRetryBlocked (a page-lifetime instance now) could stay stuck true.
  const handleModalClose = (): void => {
    closeModal();
    submission.resetSubmissionState();
  };

  // Persists a genuinely new unit's position at the end of its day. Guarded on the unit not
  // already being in `units` so an idempotent replay doesn't get repositioned.
  // `units` only covers the visible week, so for a unit dated outside it the plan would list the
  // new unit alone and the order request would drop that day's existing manual order. Such a
  // unit keeps the position the backend assigned on creation.
  const handleUnitAdded = (newUnit: RawUnit): void => {
    if (units.some((unit) => unit.id === newUnit.id)) return;
    if (!dates.some((date) => dayjs(newUnit.date).isSame(date, 'day'))) return;

    const plan = computeAppendNewUnitPlan(units, newUnit.id, new Date(newUnit.date));
    appendNewUnitMutation.mutate(plan, { onError: showReorderErrorToast });
  };

  const renderModal = (): JSX.Element | null => {
    switch (modalConfig.type) {
      case 'add':
        return (
          <Modal close={handleModalClose} isOpen={modalConfig.isOpen}>
            <UnitForm date={modalConfig.date} units={units} submission={submission} onUnitAdded={handleUnitAdded} />
          </Modal>
        );
      case 'edit':
        return (
          <Modal close={handleModalClose} isOpen={modalConfig.isOpen}>
            <UnitForm date={modalConfig.date} unit={modalConfig.unit} units={units} submission={submission} />
          </Modal>
        );
      case 'deleteConfirmation':
        return (
          <Confirmation
            actionType="delete"
            confirmActions={confirmationActions}
            isOpen={modalConfig.isOpen}
            onCancel={handleDeleteConfirmationCancel}
            text={t('working_time.confirmations.message.delete_report')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleOnDragStart} onDragEnd={handleDragEnd} onDragOver={handleDragOver}>
      <div className={styles.root}>
        <div className={styles.dates}>
          {datesToShow.map((date) => {
            const isSameDayInstance = isSameDay(dayjs().toDate(), date);
            const dateUnits = weekUnits.filter((unit) => dayjs(unit.date).isSame(date, 'day'));
            const sortedDateUnits = dateUnits.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
            const sortedDateUnitsIds = sortedDateUnits.map((unit) => unit.id);
            const isDailyReportCompleted = isReportedMinimumHoursForDay(units, date);

            const hasSortedUnits = sortedDateUnitsIds.length > 0;

            const hoursSummary = dateUnits
              .filter(({ entryType }) => entryType === WorkUnitEntryType.Worklog)
              .reduce((acc, unit) => {
                if (unit.duration) return acc + convertIsoDurationToHours(unit.duration);
                return acc;
              }, 0);
            const formattedHoursSummary = convertTimeFormat({
              time: hoursSummary,
              fractionalHour: true,
              includeColons: true,
            });

            return (
              <div key={date.toISOString()} className={styles.date}>
                <div className={styles.dateHeaderBackground}>
                  <div className={styles.dateHeader}>
                    <div className={styles.dateHeaderContent}>
                      <IconButton
                        className={styles.arrowButton}
                        disabled={dayjs(currentDate).isSame(dates[0], 'day')}
                        icon={<Icon icon={icons.arrowLeft} width={7} height={12} />}
                        onClick={setCurrentDateToPrevDay}
                        variant="raw"
                      />
                      <div className={styles.dateHeaderContentTextBox}>
                        <span
                          className={clsx({
                            [styles.todaysDay]: isSameDayInstance,
                          })}
                        >
                          {formatDateDay(date)}
                        </span>
                        <span>{formatDateWeekday(date)}</span>
                      </div>
                      <IconButton
                        className={styles.arrowButton}
                        disabled={isSameDay(dates[dates.length - 1], currentDate)}
                        icon={<Icon icon={icons.arrowRight} width={7} height={12} />}
                        onClick={setCurrentDateToNextDay}
                        variant="raw"
                      />
                    </div>
                  </div>
                </div>
                <div className={styles.dateBody}>
                  <div className={styles.dateBodyHeader}>
                    <div className={clsx(styles.summary, { [styles.summaryCompleted]: isDailyReportCompleted })}>
                      <Icon icon={icons.clock} width={16} height={16} />
                      <p>
                        {t('working_time.calendar.text.sum')} {formattedHoursSummary}
                      </p>
                      {isDailyReportCompleted && <Icon icon={icons.checkmark} width={13} height={13} />}
                    </div>
                    <Button
                      className={styles.addActivityButton}
                      disabled={isDateAfterToday(date)}
                      fontWeight="regular"
                      label={t('working_time.calendar.button.add_activity.label')}
                      onClick={() => handleUnitAddFormOpen(date)}
                      size="small"
                      variant="contained"
                      hidden={restrictedAccess}
                    />
                  </div>
                  <DroppableUnitArea
                    key={date.toISOString()}
                    date={date.toISOString()}
                    dragEndDate={dragEndDate}
                    dragStartDate={dragStartDate}
                  >
                    <div className={styles.dateBodyContent}>
                      {hasSortedUnits && (
                        <div className={styles.dateBodyContentUnits}>
                          <SortableContext items={sortedDateUnitsIds}>
                            {sortedDateUnits.map((unit) => (
                              <DraggableUnit
                                key={unit.id}
                                unit={unit}
                                activeUnitSequenceIndex={activeDraggedUnit && activeDraggedUnit.sequenceIndex}
                              />
                            ))}
                          </SortableContext>
                        </div>
                      )}
                      <IconButton
                        className={clsx(styles.addActivityIconButton, {
                          [styles.addActivityIconButtonMaxHeight]: hasSortedUnits,
                        })}
                        color="primaryLightest"
                        disabled={isDateAfterToday(date)}
                        icon={<Icon icon={icons.x} />}
                        onClick={() => handleUnitAddFormOpen(date)}
                        size="large"
                        variant="raw"
                        hidden={restrictedAccess}
                        maxWidth
                      />
                    </div>
                  </DroppableUnitArea>
                </div>
              </div>
            );
          })}
        </div>
        {renderModal()}
      </div>
      {createPortal(<DragOverlay>{<DraggableUnit unit={activeDraggedUnit} dragged />}</DragOverlay>, document.body)}
    </DndContext>
  );
}

export default Calendar;
