import noProjectsImage from '@/core/theme/assets/images/projectsComponentImages/teamWorkImage.png';
import NoDataFound from '@/core/theme/noDataFound';
import SortableHeadCell from '@/core/theme/sortableHeadCell';
import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { Project } from '@/modules/projects/types';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import ProjectRow from './projectRow';
import styles from './ProjectsBoard.module.scss';

const COLUMNS = [SortColumn.Project, SortColumn.Client, SortColumn.Members, SortColumn.DateAdded];

interface ProjectsBoardProps {
  projects: Project[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  updateSort: (column: SortColumn) => void;
}

function ProjectsBoard({ projects, sortColumn, sortDirection, updateSort }: ProjectsBoardProps): JSX.Element {
  const { t } = useTranslation();

  const sortedProjects = [...projects].sort((a, b) => {
    let compare = 0;
    switch (sortColumn) {
      case SortColumn.Project:
        compare = a.name.localeCompare(b.name);
        break;
      case SortColumn.Client:
        compare = a.client.name.localeCompare(b.client.name);
        break;
      case SortColumn.Members:
        compare = a.userCount - b.userCount;
        break;
      case SortColumn.DateAdded:
        compare = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        break;
      default:
        break;
    }
    return sortDirection === SortDirection.Asc ? -compare : compare;
  });

  const table = (
    <table className={clsx('table', styles.tableCustom)}>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <SortableHeadCell
              key={c}
              column={c}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              updateSort={updateSort}
            />
          ))}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {sortedProjects.map((p) => (
          <ProjectRow key={p.id} project={p} />
        ))}
      </tbody>
    </table>
  );

  const noDataFound = (
    <NoDataFound withoutButton image={noProjectsImage} label={t('projects.project_board.text.no_projects_found')} />
  );

  return sortedProjects.length > 0 ? table : noDataFound;
}

export default ProjectsBoard;
