import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import Confirmation, { ConfirmationAction } from '@/core/theme/confirmation';
import LoadingArea from '@/core/theme/loadingArea';
import Modal from '@/core/theme/modal';
import PageHeader from '@/core/theme/pageHeader';
import ScrolledContainer from '@/core/theme/scrolledContainer';
import Snackbar from '@/core/theme/snackbar';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { useInactivityDataPolling, useTitle } from '@/core/utils/hooks';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useClients } from '@/modules/clients/ClientsProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { getReportedUnits } from '@/modules/reports/hooks/useReportedUnits';
import { selectModeledUnits, useUnitsQuery } from '@/modules/workingTime/hooks/useUnitsQuery';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bootstrapWorkingTime } from './bootstrapWorkingTime';
import Calendar from './Calendar/Calendar';
import { useWorkUnitSubmission } from './Calendar/UnitForm/useWorkUnitSubmission';
import DatePicker from './DatePicker/DatePicker';
import { getDraftReminderRemainingMs, postponeDraftReminder } from './draftReminder';
import DraftsBoard from './DraftsBoard';
import { UnitState } from './types';
import { buildMainUnitsDto, calculateUnitsWeeklyTotalHours } from './unitCalculations';
import { useUnitWorkspace } from './UnitWorkspaceProvider';
import { useWeekNavigation } from './useWeekNavigation';
import WeeklyHoursBar from './WeeklyHoursBar';
import styles from './WorkingTime.module.scss';

// Matches the dateFrom the old store's (now-deleted) getLoggedUserDrafts used for its drafts fetch.
const MAX_DATA_FETCH_DATE = '2017-01-01';

function WorkingTime(): JSX.Element {
  const { fetchClients } = useClients();
  const { t } = useTranslation();
  const { fetchProjects } = useProjects();

  const workspace = useWorkspace();
  const auth = useAuth();
  const { loggedInUser } = auth;
  const { contextOrganizationSlug, isContextOrganizationSlugInLocalStorage, contextOrganizationUsers } = workspace;
  const loggedInUserId = loggedInUser?.id;
  const { hasAccess } = auth;
  const [reminderCheck, setReminderCheck] = useState(0);
  const {
    closeArchiveDraftConfirmation,
    closeUnreportedDraftsModal,
    closeUnreportedDraftsWarning,
    handleArchiveSelectedUnit,
    isArchiveDraftConfirmOpen,
    isUnreportedDraftsModalOpen,
    isUnreportedDraftsWarningOpen,
    openUnreportedDraftsModal,
    openUnreportedDraftsWarning,
  } = useUnitWorkspace();

  const { dates, weekStart, weekEnd, goToPrevWeek, goToNextWeek, goToToday } = useWeekNavigation();

  const mainUnitsDto = buildMainUnitsDto(weekStart, weekEnd, loggedInUser ? [loggedInUser.id] : []);
  const unitsQuery = useUnitsQuery(mainUnitsDto, { enabled: Boolean(loggedInUser) });

  const draftsDto = {
    dateFrom: MAX_DATA_FETCH_DATE,
    userId: loggedInUser ? [loggedInUser.id] : [],
    state: UnitState.Draft,
  };
  // Drops the store's areUnreportedDrafts gate on this fetch -- an org/user with no drafts just
  // gets an empty result back.
  const draftsQuery = useUnitsQuery(draftsDto, { enabled: Boolean(loggedInUser) });

  // useQuery's result isn't referentially stable across renders, so closing over it directly here
  // would give fetchWorkingTimeData a new identity every render, re-triggering the bootstrap effect
  // below forever. Read the latest query via ref instead.
  const unitsQueryRef = useRef(unitsQuery);
  unitsQueryRef.current = unitsQuery;
  const draftsQueryRef = useRef(draftsQuery);
  draftsQueryRef.current = draftsQuery;

  // Replaces the store's refreshWorkUnitViews(): a permanently blocked submission may already be
  // applied server-side, so the views need to resync even though no mutation onSuccess fires.
  const onSubmissionBlocked = useCallback((): void => {
    void unitsQueryRef.current.refetch();
    void draftsQueryRef.current.refetch();
    void getReportedUnits();
  }, [getReportedUnits]);

  // Lifted here (not inside UnitForm, which only mounts while its modal is open) so DraftsBoard, a
  // sibling in a separate modal, can share the same in-flight/loading state.
  const submission = useWorkUnitSubmission(onSubmissionBlocked);

  const units = selectModeledUnits(unitsQuery.data, contextOrganizationUsers);
  const unreportedDrafts = selectModeledUnits(draftsQuery.data, contextOrganizationUsers);
  const areUnreportedDrafts = (unitsQuery.data?.draftIds.length ?? 0) > 0;
  const loadingUnits = unitsQuery.isLoading;
  const loadingDrafts = draftsQuery.isLoading;
  const unitsWeeklyTotalHours = calculateUnitsWeeklyTotalHours(units);

  const fetchWorkingTimeData = useCallback((): void => {
    void unitsQueryRef.current.refetch();
    void draftsQueryRef.current.refetch();
    void fetchProjects(true);
    void fetchProjects();
    void fetchClients();
  }, [fetchClients, fetchProjects]);

  useTitle(t('common.working_time'));

  useInactivityDataPolling(fetchWorkingTimeData, 30000, 60000, [loggedInUser]);

  useEffect(() => {
    bootstrapWorkingTime({
      contextOrganizationSlug,
      fetchWorkingTimeData,
      isContextOrganizationSlugInLocalStorage,
      loggedInUserId,
    });
  }, [contextOrganizationSlug, fetchWorkingTimeData, isContextOrganizationSlugInLocalStorage, loggedInUserId]);

  // A failed initial query otherwise has no data and is rendered as an empty calendar. Keep the
  // previous store's feedback for both queries: drafts are fetched independently, so their
  // failure must not be mistaken for there being no unreported drafts.
  useEffect(() => {
    if (unitsQuery.isError)
      showModuleErrorToast(unitsQuery.error, { default: t('toast_message.working_time.data_fetch_error') });
    if (draftsQuery.isError)
      showModuleErrorToast(draftsQuery.error, { default: t('toast_message.working_time.data_fetch_error') });
  }, [draftsQuery.error, draftsQuery.isError, t, unitsQuery.error, unitsQuery.isError]);

  useEffect(() => {
    if (unreportedDrafts.length === 0) closeUnreportedDraftsModal();
  }, [unreportedDrafts.length, closeUnreportedDraftsModal]);

  const postponeUnreportedDraftsWarning = useCallback((): void => {
    if (loggedInUserId) postponeDraftReminder(loggedInUserId, contextOrganizationSlug);
    closeUnreportedDraftsWarning();
    setReminderCheck((value) => value + 1);
  }, [closeUnreportedDraftsWarning, contextOrganizationSlug, loggedInUserId]);

  useEffect(() => {
    if (!loggedInUserId) return;
    const remaining = getDraftReminderRemainingMs(loggedInUserId, contextOrganizationSlug);
    const timeout = remaining > 0 ? setTimeout(() => setReminderCheck((value) => value + 1), remaining) : undefined;
    const onVisibilityChange = (): void => {
      if (!document.hidden) setReminderCheck((value) => value + 1);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      if (timeout) clearTimeout(timeout);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [contextOrganizationSlug, loggedInUserId, reminderCheck]);

  // Replaces the store's own openUnreportedDraftsWarning() calls -- re-check whenever a fetch
  // settles or the drafts/modal state changes.
  useEffect(() => {
    if (!loadingUnits && loggedInUserId && contextOrganizationSlug) {
      openUnreportedDraftsWarning(
        areUnreportedDrafts &&
          !isUnreportedDraftsModalOpen &&
          hasAccess(ROLE_PERMISSIONS.Internal) &&
          getDraftReminderRemainingMs(loggedInUserId, contextOrganizationSlug) === 0,
      );
    }
  }, [
    loadingUnits,
    areUnreportedDrafts,
    isUnreportedDraftsModalOpen,
    hasAccess,
    openUnreportedDraftsWarning,
    loggedInUserId,
    contextOrganizationSlug,
    reminderCheck,
  ]);

  const workingTimeContent = (
    <>
      <PageHeader className={styles.header} title={t('common.working_time')}>
        <DatePicker dates={dates} goToPrevWeek={goToPrevWeek} goToNextWeek={goToNextWeek} goToToday={goToToday} />
      </PageHeader>
      <div className={styles.calendarBoard}>
        <Calendar dates={dates} weekStart={weekStart} weekEnd={weekEnd} submission={submission} />
      </div>
    </>
  );

  const unreportedDraftsText =
    !loadingUnits && areUnreportedDrafts && !loadingDrafts
      ? t('working_time.confirmations.message.unreported_draft_count', { count: unreportedDrafts.length })
      : t('working_time.confirmations.message.counting_your_drafts');

  const unreportedDraftsActions: ConfirmationAction[] = [
    {
      text: t('working_time.common.report'),
      action: openUnreportedDraftsModal,
    },
  ];
  const archiveUnitConfirmations: ConfirmationAction[] = [
    {
      text: t('common.discard'),
      action: handleArchiveSelectedUnit,
    },
  ];

  return (
    <>
      <ScrolledContainer>
        <div className={styles.mainContent}>
          <LoadingArea loading={loadingUnits} className={styles.loadingAreaWrapper}>
            {workingTimeContent}
          </LoadingArea>
        </div>
      </ScrolledContainer>
      <Snackbar
        className={styles.snackbar}
        isVisible={unitsWeeklyTotalHours > 0}
        withToggleButton
        toggleButtonLabel={t('working_time.weekly_hours_bar.button.weekly_overview.label')}
      >
        <WeeklyHoursBar units={units} loadingUnits={loadingUnits} />
      </Snackbar>
      <Confirmation
        isOpen={isUnreportedDraftsWarningOpen}
        title={t('working_time.confirmations.title.gentle_nudge')}
        actionType="attention"
        confirmActions={unreportedDraftsActions}
        cancelBtnText={t('working_time.confirmations.text.report_later')}
        text={unreportedDraftsText}
        onCancel={postponeUnreportedDraftsWarning}
      />
      <Confirmation
        actionType="archive"
        confirmActions={archiveUnitConfirmations}
        cancelBtnText={t('working_time.confirmations.text.do_nothing')}
        isOpen={isArchiveDraftConfirmOpen}
        onCancel={closeArchiveDraftConfirmation}
        text={t('working_time.confirmations.message.discard_this_draft')}
      />
      <Modal
        className={styles.draftsModal}
        isOpen={isUnreportedDraftsModalOpen}
        close={closeUnreportedDraftsModal}
        disableClickOutside
      >
        <DraftsBoard
          close={closeUnreportedDraftsModal}
          unreportedDrafts={unreportedDrafts}
          isSubmitting={submission.isSubmitting}
        />
      </Modal>
    </>
  );
}

export default WorkingTime;
