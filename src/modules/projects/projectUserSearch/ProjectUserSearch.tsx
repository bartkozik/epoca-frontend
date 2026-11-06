import Avatars from '@/core/theme/avatars';
import { SelectOption } from '@/core/theme/inputs';
import Search from '@/core/theme/search';
import { KeyBoardEventType, useKeyDown, useOnClickOutside } from '@/core/utils/hooks';
import { useAuth } from '@/modules/auth/AuthProvider';
import { organizationUserToUser } from '@/modules/organizations/modelOrganizationUser';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { ProjectUser, ProjectUserRole } from '@/modules/projects/types';
import { withOrganizationUserEmails } from '@/modules/projects/utils/with-organization-user-emails';
import { User, UserAction } from '@/modules/users/types';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './ProjectUserSearch.module.scss';

interface ProjectUserSearchProps {
  className?: string;
  handleUserAction: (label: ProjectUserRole, action: UserAction, user: User | ProjectUser) => void;
  label: ProjectUserRole;
  placeholder?: string;
  selectedUsers: (User | ProjectUser)[];
  infoText?: string;
}

function ProjectUserSearch({
  className,
  handleUserAction,
  infoText = '',
  label,
  placeholder,
  selectedUsers,
}: ProjectUserSearchProps): JSX.Element {
  const { t } = useTranslation();
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const workspace = useWorkspace();
  const { loggedInUser } = useAuth();
  const { selectedProjectMembers, selectedProjectOwners } = useProjects();
  const { availableToAddContextOrganizationUsers, contextOrganizationUsers } = workspace;

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  const selectedInOtherRole = label === ProjectUserRole.Owner ? selectedProjectMembers : selectedProjectOwners;
  const availableUsers = availableToAddContextOrganizationUsers.filter((user) => {
    if (selectedUsers.some(({ id }) => id === user.id)) return false;
    if (label === ProjectUserRole.Member && user.id === loggedInUser?.id) return true;
    return !selectedInOtherRole?.some(({ id }) => id === user.id);
  });

  const availableUsersOptions = availableUsers.map(({ id, displayedName, email }) => ({
    value: id,
    label: displayedName,
    email,
  }));

  const handleOnSelect = ({ value }: SelectOption): void => {
    const user = availableUsers.find(({ id }) => id === value);
    if (user) handleUserAction(label, 'add', organizationUserToUser(user));
  };

  const labelForAddUsers =
    label === ProjectUserRole.Owner
      ? t('projects.project_user_search.text.project_owners')
      : t('projects.project_user_search.text.project_members');

  const handleShowAndGoToUsersList = (): void => {
    if (document.activeElement === addButtonRef.current) {
      setIsSelectOpen(true);
    } else {
      setIsSelectOpen(false);
    }
  };

  useOnClickOutside({
    ref: dropdownRef,
    handler: () => setIsSelectOpen(false),
  });

  useKeyDown({
    keyboardEventType: KeyBoardEventType.TAB,
    action: handleShowAndGoToUsersList,
    isListening: true,
  });

  return (
    <div className={clsx(styles.root, className)}>
      <Avatars
        buttonDisabled={isSelectOpen}
        className={styles.avatars}
        items={withOrganizationUserEmails(selectedUsers, contextOrganizationUsers)}
        infoText={infoText}
        label={labelForAddUsers}
        onAddItem={() => setIsSelectOpen(true)}
        onItemDelete={(user) => handleUserAction(label, 'remove', user)}
        addButtonRef={addButtonRef}
      />
      {isSelectOpen && (
        <div ref={dropdownRef} className={styles.selectUsers}>
          <Search
            emptyItemsMessage={t('projects.project_user_search.text.all_users_added')}
            multiple
            withCheckbox
            items={availableUsersOptions}
            name="User Select"
            noResultsMessage={t('projects.project_user_search.text.no_matching_users')}
            onSelect={handleOnSelect}
            placeholder={placeholder}
          />
        </div>
      )}
    </div>
  );
}

export default ProjectUserSearch;
