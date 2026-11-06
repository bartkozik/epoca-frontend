import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import Spinner from '@/core/theme/spinner';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useClientProjectsQuery } from '@/modules/clients/hooks/useClientProjectsQuery';
import { Client } from '@/modules/clients/types';
import { projectsPaths } from '@/modules/projects/routes';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import styles from './ClientProjectsList.module.scss';

interface ClientProjectsListProps {
  client: Client;
  onProjectAdd: () => void;
}

const ClientProjectsList = ({ client, onProjectAdd }: ClientProjectsListProps): JSX.Element => {
  const { t } = useTranslation();
  const { projectCount } = client;

  const auth = useAuth();
  const { hasAccess } = auth;
  const [isProjectsDropdownOpen, setIsProjectsDropdownOpen] = useState(false);
  const clientProjectsQuery = useClientProjectsQuery(client.id, isProjectsDropdownOpen);
  const projects = clientProjectsQuery.data?.results ?? [];

  useEffect(() => {
    if (clientProjectsQuery.isError)
      showModuleErrorToast(clientProjectsQuery.error, { default: t('toast_message.projects.data_fetch_error') });
  }, [clientProjectsQuery.error, clientProjectsQuery.isError, t]);

  const toggleList = (): void => setIsProjectsDropdownOpen((current) => !current);

  const restrictedAccess = !hasAccess(ROLE_PERMISSIONS.Manager);

  const addProjectBtn = (
    <Button
      className={clsx(
        styles.addProjectButton,
        { [styles.noProjectsButton]: !projectCount },
        { hidden: restrictedAccess },
      )}
      label={t('common.add_new_project')}
      size="medium"
      variant="transparent"
      onClick={onProjectAdd}
    />
  );

  const projectsDropdownList = (
    <div className={styles.list}>
      <div className={styles.relativeContainer}>
        <Button
          label={t('clients.clients_board.client_project_list.button.project_count.label', {
            count: projectCount || projects.length,
          })}
          variant="text"
          size="medium"
          onClick={toggleList}
        />
        <Icon
          icon={icons.arrow}
          width={12}
          height={8}
          className={clsx(styles.icon, { [styles.arrow]: isProjectsDropdownOpen })}
        />
        <Spinner className={styles.spinner} loading={clientProjectsQuery.isFetching} small />
      </div>
      {isProjectsDropdownOpen && (
        <div className={styles.listContent}>
          {projects.map(({ id, name }) => (
            <NavLink key={id} to={projectsPaths.details(id, 'project-details')} className={clsx(styles.listItem)}>
              <Icon icon={icons.projectFile} className={styles.fileIcon} />
              <span className={styles.listItemName}>{name}</span>
            </NavLink>
          ))}
          {addProjectBtn}
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.root}>{!projectCount && projects.length === 0 ? addProjectBtn : projectsDropdownList}</div>
  );
};

export default ClientProjectsList;
