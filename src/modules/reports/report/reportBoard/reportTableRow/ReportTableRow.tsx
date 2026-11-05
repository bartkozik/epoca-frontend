import { isDemo } from '@/core/config/demo';
import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import Checkbox from '@/core/theme/checkbox';
import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import LinkCreator from '@/core/theme/linkCreator';
import MoreInfoDropdown from '@/core/theme/moreInfoDropdown';
import { shortenTextToLength } from '@/core/utils/helpers';
import { useAuth } from '@/modules/auth/AuthProvider';
import { ReportedUnit, WorkUnitEntryType } from '@/modules/workingTime/types';
import { useTranslation } from 'react-i18next';
import WorkUnitOverrideBadge from '../../workUnitOverride/WorkUnitOverrideBadge';
import styles from '../ReportBoard.module.scss';

interface ReportTableRowProps {
  unit: ReportedUnit;
  isSelected: boolean;
  onCheckboxClick: (unitId: string) => void;
  onArchive: () => void;
  onEdit: () => void;
}

const ReportTableRow = ({
  unit,
  isSelected,
  onCheckboxClick,
  onArchive,
  onEdit,
}: ReportTableRowProps): JSX.Element | null => {
  const { t } = useTranslation();

  const auth = useAuth();
  const { hasAccess, loggedInUser } = auth;

  const {
    entryType,
    formattedDate,
    effectiveProjectClient,
    effectiveTaskId,
    formattedReportDuration,
    description,
    userFullName,
    userId,
  } = unit;

  const clientName = effectiveProjectClient?.clientName ?? t('common.unknown');
  const projectName = effectiveProjectClient?.projectName ?? t('common.unknown');

  const restrictedAccess = hasAccess(ROLE_PERMISSIONS.Internal);

  const isLoggedInUserUnitOrOwnerRole =
    (loggedInUser && userId === loggedInUser.id) || hasAccess(ROLE_PERMISSIONS.Owner);
  const displayedDuration = entryType === WorkUnitEntryType.Note ? '-' : formattedReportDuration;

  const canOpenCorrection =
    !isDemo && Boolean(unit.override?.permissions.canEdit || unit.override?.permissions.canViewHistory);
  const actionButtons =
    restrictedAccess || canOpenCorrection ? (
      <div className={styles.btnBox}>
        <IconButton
          className={styles.rowAction}
          icon={<Icon icon={icons.pencil} width={14} height={14} />}
          ariaLabel={t('common.edit')}
          title={t('common.edit')}
          variant="raw"
          size="small"
          onClick={onEdit}
          disabled={!(restrictedAccess && isLoggedInUserUnitOrOwnerRole && unit.projectClient) && !canOpenCorrection}
        />
        {restrictedAccess && (
          <IconButton
            className={styles.rowAction}
            icon={<Icon icon={icons.remove} width={13} height={16} />}
            ariaLabel={t('common.delete')}
            title={t('common.delete')}
            variant="raw"
            size="small"
            onClick={onArchive}
            disabled={!isLoggedInUserUnitOrOwnerRole}
          />
        )}
      </div>
    ) : (
      <div className={styles.emptyBtnBox}></div>
    );

  const MORE_LIST_ITEMS = [
    { label: t('common.project_name'), value: projectName },
    { label: t('common.client'), value: clientName },
    { label: t('common.user'), value: userFullName || '' },
    {
      label: t('common.description_of_activity'),
      value: <LinkCreator className={styles.descriptionLink} text={description} />,
    },
    { label: t('common.task_id'), value: effectiveTaskId ?? '' },
    { label: t('common.hours'), value: displayedDuration },
  ];

  return (
    <tr>
      <td data-th="Export">
        <span className={styles.checkboxCell}>
          <Checkbox
            ariaLabel={t('report.report_board.select_entry', { date: formattedDate, user: userFullName ?? '' })}
            className={styles.checkbox}
            selected={isSelected}
            onClick={() => onCheckboxClick(unit.id)}
            variant="square"
          />
        </span>
      </td>
      <td data-th="Date">
        {formattedDate}
        <div>
          <WorkUnitOverrideBadge workUnitId={unit.id} override={unit.override} revision={unit.revision} />
        </div>
        <MoreInfoDropdown items={MORE_LIST_ITEMS}>
          <div className={styles.btnBoxMobile}>{actionButtons}</div>
        </MoreInfoDropdown>
      </td>
      <td data-th="Client">{clientName}</td>
      <td data-th="Project">{projectName}</td>
      <td data-th="User">{userFullName}</td>
      <td data-th="Description of activity" title={description}>
        <span className={styles.descriptionClamp}>
          <LinkCreator className={styles.descriptionLink} text={shortenTextToLength(description, 140)} />
        </span>
      </td>
      <td data-th="Task ID">{effectiveTaskId}</td>
      <td data-th="Hours">{displayedDuration}</td>
      <td data-th="Actions">
        <div className={styles.btnBox}>{actionButtons}</div>
      </td>
    </tr>
  );
};

export default ReportTableRow;
