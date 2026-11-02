import Button from '@/core/theme/button';
import FormHeader from '@/core/theme/FormHeader';
import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import LoadingArea from '@/core/theme/loadingArea';
import ScrolledContainer from '@/core/theme/scrolledContainer';
import TableItemName from '@/core/theme/tableItemName';
import { shortenTextToLength } from '@/core/utils/helpers';
import { Unit } from '@/modules/workingTime/types';
import { useUnitWorkspace } from '@/modules/workingTime/UnitWorkspaceProvider';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './DraftsBoard.module.scss';

interface DraftsBoardProps {
  close: () => void;
  unreportedDrafts: Unit[];
  isSubmitting: boolean;
}

const DraftsBoard = ({ close, unreportedDrafts, isSubmitting }: DraftsBoardProps): JSX.Element => {
  const { t } = useTranslation();
  const { handleUnitEditFormOpen, openArchiveDraftConfirmation } = useUnitWorkspace();

  const unreportedDraftsText = t('working_time.drafts_board.text.unreported_drafts_count', {
    count: unreportedDrafts.length,
  });

  return (
    <div className={styles.root}>
      <FormHeader title={t('working_time.drafts_board.title.unreported_drafts')} />
      <LoadingArea loading={isSubmitting}>
        <ScrolledContainer className={styles.scrolledContainer}>
          <table className={clsx('table', styles.tableCustom)}>
            <thead>
              <tr>
                <th data-th="Date"> {t('working_time.drafts_board.table_header.date')}</th>
                <th data-th="Client">{t('working_time.drafts_board.table_header.client')}</th>
                <th data-th="Project">{t('working_time.drafts_board.table_header.project')}</th>
                <th data-th="Description">{t('common.description')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {unreportedDrafts.map((draft) => {
                const { id, formattedDate, projectClient, description } = draft;

                if (!projectClient) return null;

                return (
                  <tr key={id}>
                    <td data-th="Date">{formattedDate}</td>
                    <td data-th="Client">
                      <span className={styles.desktopClientName}>{projectClient.clientName}</span>
                      <div className={styles.mobileContainer}>
                        <TableItemName color={projectClient.clientColor} name={projectClient.clientName} />
                        <p>
                          <span>{t('working_time.drafts_board.table_header.project')}: </span>
                          {projectClient.projectName}
                        </p>
                        <p>
                          <span>{t('common.description')}:</span>
                          {shortenTextToLength(description, 140)}
                        </p>
                      </div>
                    </td>
                    <td data-th="Project">{projectClient.projectName}</td>
                    <td data-th="Description" title={description}>
                      {shortenTextToLength(description, 140)}
                    </td>
                    <td>
                      <div className={styles.btnBox}>
                        <IconButton
                          label={t('working_time.common.report')}
                          variant="contained"
                          icon={<Icon icon={icons.pencil} width={16} height={16} />}
                          onClick={() => handleUnitEditFormOpen(draft)}
                        />
                        <IconButton
                          label={t('common.discard')}
                          variant="contained"
                          icon={<Icon icon={icons.remove} width={16} height={16} />}
                          onClick={() => openArchiveDraftConfirmation(draft)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrolledContainer>
      </LoadingArea>
      <div className={styles.buttonInfoBox}>
        <p className={styles.infoText}>{unreportedDraftsText}</p>
        <Button
          className={styles.closeButton}
          label={t('working_time.drafts_board.button.remind_me_later.label')}
          variant="contained"
          onClick={close}
        />
      </div>
    </div>
  );
};

export default DraftsBoard;
