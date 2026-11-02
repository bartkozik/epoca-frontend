import Button from '@/core/theme/button';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { useTranslation } from 'react-i18next';
import type { WorkUnitOverrideController } from './useWorkUnitOverride';
import styles from './WorkUnitOverrideForm.module.scss';

export default function WorkUnitOverrideConflict({
  controller: c,
}: {
  controller: WorkUnitOverrideController;
}): JSX.Element | null {
  const { t } = useTranslation();
  const projectsContext = useProjects();
  if (!c.conflict) return null;
  const { current, proposal, intent } = c.conflict;
  const project = projectsContext.reportedProjects.find(
    (project) =>
      project.id === proposal.projectId && current.override.permissions.allowedProjectIds.includes(project.id),
  );
  const proposedProject =
    proposal.projectId === null
      ? current.projectClient
      : project
        ? { clientName: project.client.name, projectName: project.name }
        : null;
  const proposedTask =
    proposal.taskId.mode === 'Inherit'
      ? current.taskId
      : proposal.taskId.mode === 'Clear'
        ? null
        : proposal.taskId.value.trim();
  const values = [
    { side: 'current', project: current.effectiveProjectClient, taskId: current.effectiveTaskId },
    { side: 'proposed', project: proposedProject, taskId: proposedTask },
  ];
  return (
    <section className={styles.conflict} aria-label={t('reports.override.conflict.heading')}>
      <h3>{t('reports.override.conflict.heading')}</h3>
      {intent.kind === 'save' ? (
        <div className={styles.comparison}>
          {values.map((value) => (
            <section key={value.side} aria-label={t(`reports.override.conflict.${value.side}`)}>
              <h4>{t(`reports.override.conflict.${value.side}`)}</h4>
              <dl>
                <dt>{t('common.client')}</dt>
                <dd>{value.project?.clientName ?? t('reports.override.sourceUnavailable')}</dd>
                <dt>{t('common.project')}</dt>
                <dd>{value.project?.projectName ?? t('reports.override.sourceUnavailable')}</dd>
                <dt>{t('common.task_id')}</dt>
                <dd>{value.taskId || t('reports.override.history.blank')}</dd>
              </dl>
            </section>
          ))}
        </div>
      ) : (
        <p>{t('reports.override.undo.action')}</p>
      )}
      <div className={styles.actions}>
        <Button type="button" label={t('reports.override.conflict.useCurrent')} onClick={c.useCurrent} />
        <Button type="button" label={t('reports.override.conflict.review')} onClick={c.reviewAndReapply} />
      </div>
    </section>
  );
}
