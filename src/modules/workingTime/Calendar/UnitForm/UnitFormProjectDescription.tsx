import InfoIcon from '@/core/theme/infoIcon';
import LinkCreator from '@/core/theme/linkCreator';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { ClientAndProjectOption } from './ClientAndProjectDropdown';
import styles from './UnitForm.module.scss';

export function UnitFormProjectDescription({
  displayedProject,
  displayedProjectDescription,
}: {
  displayedProject?: ClientAndProjectOption;
  displayedProjectDescription: string;
}): JSX.Element {
  const { t } = useTranslation();
  const projectDescriptionContent = displayedProject ? (
    <LinkCreator text={displayedProjectDescription} />
  ) : (
    t('working_time.common.project_description_will_be_displayed')
  );

  return (
    <div
      className={clsx(styles.projectDescriptionBox, {
        [styles.descriptionHidden]: displayedProject && !displayedProjectDescription,
      })}
    >
      <div className={styles.projectDescriptionLabel}>
        <span className={styles.projectDescriptionLabelText}>
          {t('working_time.calendar.unit_form.title.project_description')}
        </span>
        <InfoIcon
          iconClassName={styles.projectDescriptionInfoIcon}
          tooltipText={t('working_time.common.project_description_will_be_displayed')}
        />
      </div>
      <p className={styles.projectDescription}>{projectDescriptionContent}</p>
    </div>
  );
}
