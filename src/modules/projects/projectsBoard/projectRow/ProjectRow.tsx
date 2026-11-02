import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import TableItemName from '@/core/theme/tableItemName';
import { MAX_TABLE_ITEM_NAME_LENGTH } from '@/core/utils/constants';
import { shortenTextToLength, withFromListSearch } from '@/core/utils/helpers';
import { Project } from '@/modules/projects/types';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { projectsPaths } from '../../routes';
import styles from '../ProjectsBoard.module.scss';

const TAB_VALUE = {
  projectDetails: 'project-details',
};

interface ProjectRowProps {
  project: Project;
}

const ProjectRow = ({ project }: ProjectRowProps): JSX.Element => {
  const { t } = useTranslation();
  const { name, client, userCount, formattedCreatedAt, id } = project;
  const navigate = useNavigate();
  const location = useLocation();

  const handleDetailsClick = (projectId: string): void => {
    navigate(projectsPaths.details(projectId, TAB_VALUE.projectDetails), {
      state: withFromListSearch(location.search),
    });
  };

  return (
    <tr>
      <td data-th="Project">
        <TableItemName name={name} />
        <span className={styles.clientNameBox}>{shortenTextToLength(client.name, MAX_TABLE_ITEM_NAME_LENGTH)}</span>
      </td>
      <td data-th="Client">
        <TableItemName color={client.color} name={client.name} />
      </td>
      <td data-th="Members">{userCount}</td>
      <td data-th="Date Added">{formattedCreatedAt}</td>
      <td data-th="Action">
        <IconButton
          icon={<Icon icon={icons.file} width={15} height={18} />}
          label={t('common.details')}
          onClick={() => handleDetailsClick(id)}
          variant="contained"
        />
      </td>
    </tr>
  );
};

export default ProjectRow;
