import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import Button from '@/core/theme/button';
import DateSelector from '@/core/theme/dateSelector';
import FormHeader from '@/core/theme/FormHeader';
import { Input, TextArea } from '@/core/theme/inputs';
import FormErrorMessage from '@/core/theme/inputs/FormErrorMessage';
import { useAuth } from '@/modules/auth/AuthProvider';
import { WorkUnitEntryType } from '@/modules/workingTime/types';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import dayjs from 'dayjs';
import ClientAndProjectDropdown from './ClientAndProjectDropdown';
import EntryTypeSelector from './entryTypeSelector';
import type { UnitFormProps } from './types';
import styles from './UnitForm.module.scss';
import { UnitFormProjectDescription } from './UnitFormProjectDescription';
import { useUnitForm } from './useUnitForm';

function UnitForm(props: UnitFormProps): JSX.Element {
  const { unit, isFormInReportView = false, editAdapter, interactionBlocked } = props;
  const { t } = useTranslation();
  const { hasAccess } = useAuth();
  const {
    formRef,
    calendarRef,
    descriptionRef,
    selectedDay,
    dateInputValue,
    isDateSelectorOpen,
    setIsDateSelectorOpen,
    handleDateChange,
    handleEnterDate,
    handleSelectDate,
    isNote,
    isActive,
    isDraft,
    handleEntryTypeChange,
    handleClientAndProjectChange,
    displayedProject,
    displayedTaskId,
    displayedProjectDescription,
    sourceReadOnly,
    archived,
    unitCreatorIsNoProjectMember,
    clientAndProjectOptions,
    reportedUnitsClientAndProjectOptions,
    unitFormErrors,
    reportedHours,
    unitDescription,
    setTaskId,
    selectedEntryType,
    selectedClientAndProject,
    handleDescriptionChange,
    handleReportedHoursChange,
    handleSubmit,
    handleDelete,
    handleDraftDiscard,
    handleOnDraftSave,
    isSubmitting,
    isRetryBlocked,
    isSubmittingForDraft,
    isNoRequiredFieldsInFormError,
    isFormError,
    modalConfig,
    isDeletingDraft,
  } = useUnitForm(props);

  const taskIdInput = (
    <Input
      label={t('common.task_id')}
      name="taskId"
      onChange={(e) => {
        if (interactionBlocked?.() || editAdapter?.disabled || editAdapter?.assignmentReadOnly) return;
        if (editAdapter) editAdapter.onTaskIdChange(e.target.value);
        else setTaskId(e.target.value);
      }}
      readOnly={editAdapter?.assignmentReadOnly || editAdapter?.disabled}
      type="text"
      value={displayedTaskId}
    />
  );

  const dateEditor = (
    <div ref={calendarRef} className={styles.dateEditor}>
      <Input
        autoCompleteOff
        name="date"
        label={t('working_time.calendar.unit_form.field.selected_date')}
        value={dateInputValue}
        onChange={(e) => handleDateChange(e.target.value)}
        onKeyDown={handleEnterDate}
        onClick={() => setIsDateSelectorOpen(true)}
        className={styles.dateInput}
        readOnly={sourceReadOnly || editAdapter?.disabled}
      />
      {isDateSelectorOpen && !sourceReadOnly && !editAdapter?.disabled && (
        <div className={styles.dateSelector}>
          <DateSelector
            selectedSingleDay={dayjs(selectedDay)}
            hoverDirection={false}
            selectedMonth={dayjs(selectedDay)}
            onSelectDate={handleSelectDate}
            maxDate={isNote ? undefined : dayjs()}
            isDateSelectorOpen={isDateSelectorOpen}
            setIsDateSelectorOpen={setIsDateSelectorOpen}
          />
        </div>
      )}
    </div>
  );

  const submitBtnLabel =
    (modalConfig.type === 'edit' || modalConfig.type === 'reportEdit') && !isDraft
      ? t('common.update')
      : t('working_time.common.report');
  const restrictedAccess = !hasAccess(ROLE_PERMISSIONS.Internal);

  const isSubmitDisabled =
    (!isNote && !reportedHours) ||
    !unitDescription ||
    !(editAdapter ? editAdapter.project : selectedClientAndProject) ||
    isFormError;

  return (
    <form
      aria-label={unit ? t('working_time.calendar.unit_form.title.edit_hours') : undefined}
      className={clsx(styles.root, { [styles.reportForm]: isFormInReportView })}
      ref={formRef}
      onSubmit={handleSubmit}
    >
      <FormHeader
        date={selectedDay.toDate()}
        title={
          unit
            ? t('working_time.calendar.unit_form.title.edit_hours')
            : t('working_time.calendar.unit_form.title.add_hours')
        }
      />

      {unit && (!isFormInReportView || unit.entryType === WorkUnitEntryType.Note) ? (
        <div className={styles.entryTypeInformation}>
          <span className={styles.entryTypeInformationLabel}>
            {t('working_time.calendar.unit_form.information.added_as')}
          </span>
          <span className={styles.entryTypeInformationValue}>
            {t(`working_time.entry_type.${unit.entryType.toLowerCase()}`)}
          </span>
        </div>
      ) : !unit ? (
        <EntryTypeSelector
          label={t('working_time.calendar.unit_form.question.what_to_add')}
          onChange={handleEntryTypeChange}
          value={selectedEntryType}
        />
      ) : null}

      <ClientAndProjectDropdown
        autoCompleteOff
        isDisplayedInReportView={isFormInReportView}
        isProjectArchived={editAdapter ? false : archived}
        isUserExcludedFromProject={editAdapter ? false : unitCreatorIsNoProjectMember}
        disabled={editAdapter?.assignmentReadOnly || editAdapter?.disabled}
        error={unitFormErrors.projectId}
        label={t('working_time.calendar.unit_form.field.client_and_project')}
        name="clientAndProject"
        onChange={handleClientAndProjectChange}
        options={
          editAdapter
            ? editAdapter.projectOptions
            : isFormInReportView
              ? reportedUnitsClientAndProjectOptions
              : clientAndProjectOptions
        }
        placeholder={t('working_time.calendar.unit_form.placeholder.search_client_and_project')}
        value={displayedProject}
      />
      <UnitFormProjectDescription
        displayedProject={displayedProject}
        displayedProjectDescription={displayedProjectDescription}
      />
      {dateEditor}
      {!isNote && (
        <Input
          className={styles.hours}
          error={unitFormErrors.duration}
          infoText={t('working_time.calendar.unit_form.information.possible_formats')}
          label={t('common.hours')}
          name="reportedHours"
          onChange={handleReportedHoursChange}
          placeholder={t('working_time.calendar.unit_form.placeholder.duration')}
          type="text"
          value={reportedHours}
          readOnly={sourceReadOnly || editAdapter?.disabled}
        />
      )}
      <div>{taskIdInput}</div>
      <TextArea
        ref={descriptionRef}
        error={unitFormErrors.description}
        label={t('working_time.calendar.unit_form.field.description')}
        name="taskDescription"
        onChange={handleDescriptionChange}
        rows={4}
        value={unitDescription}
        readOnly={sourceReadOnly || editAdapter?.disabled}
      />
      <div className={clsx(styles.footer, { hidden: restrictedAccess && !editAdapter })}>
        <div className={clsx(styles.footerBtns, { [styles.footerBtnsEdit]: isActive })}>
          {isActive && !sourceReadOnly && (
            <Button label={t('common.delete')} onClick={handleDelete} type="button" variant="outlined" />
          )}
          {editAdapter?.extraActions}
          {(!unit || isDraft) && (
            <>
              <Button
                disabled={!unit}
                label={t('working_time.calendar.unit_form.button.discard_draft.label')}
                loading={isDeletingDraft}
                onClick={() => unit && void handleDraftDiscard(unit.id)}
                type="button"
                variant="outlined"
              />
              <Button
                className={styles.submitButton}
                disabled={!selectedClientAndProject || isSubmitting || isSubmittingForDraft || isRetryBlocked}
                label={t('working_time.calendar.unit_form.button.save_draft.label')}
                loading={isSubmittingForDraft && isSubmitting}
                onClick={handleOnDraftSave}
                type="button"
                variant="outlined"
              />
            </>
          )}
          {!(editAdapter?.sourceReadOnly && editAdapter.assignmentReadOnly) && (
            <Button
              className={styles.submitButton}
              label={submitBtnLabel}
              loading={isSubmitting && !isSubmittingForDraft}
              type="submit"
              variant="contained"
              disabled={
                (editAdapter
                  ? editAdapter.saveDisabled || editAdapter.disabled || (!sourceReadOnly && isSubmitDisabled)
                  : isSubmitDisabled) ||
                isSubmitting ||
                isRetryBlocked
              }
            />
          )}
        </div>
        <div className={styles.footerInfo}>
          {isNoRequiredFieldsInFormError && (
            <FormErrorMessage
              className={styles.formErrorMessage}
              iconPosition="right"
              message={t('working_time.calendar.unit_form.error.all_required_fields')}
            />
          )}
        </div>
      </div>
    </form>
  );
}

export default UnitForm;
