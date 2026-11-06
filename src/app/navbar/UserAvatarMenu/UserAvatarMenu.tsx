import { isDemo } from '@/core/config/demo';
import { resources } from '@/core/i18n';
import Avatar from '@/core/theme/avatar';
import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import Modal from '@/core/theme/modal';
import { normalizeGravatarEmail } from '@/core/utils/helpers/gravatar';
import { useOnClickOutside } from '@/core/utils/hooks';
import { useAuth } from '@/modules/auth/AuthProvider';
import { authPaths } from '@/modules/auth/routes';
import { useHasMoreThanOneOrganization } from '@/modules/organizations/hooks/useOrganizationsQuery';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { toUser, useUserQuery } from '@/modules/users';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/pl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCheckoutFromWorkspace } from './useCheckoutFromWorkspace';
import styles from './UserAvatarMenu.module.scss';

interface UserAvatarMenuProps {
  setIsMenuOpen: (isOpen: boolean) => void;
}

function UserAvatarMenu({ setIsMenuOpen }: UserAvatarMenuProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const auth = useAuth();
  const { logout, loggedInUser, changeUserLanguage } = auth;
  const { contextOrganizationLoggedInUser, fetchContextOrganizationUsers } = workspace;
  const hasMoreThanOneOrganization = useHasMoreThanOneOrganization();
  const checkoutFromWorkspace = useCheckoutFromWorkspace();
  const { data: loggedInUserProfile } = useUserQuery(loggedInUser?.id, { refreshAvatar: true });
  const profileUser = loggedInUserProfile ? toUser(loggedInUserProfile, loggedInUser?.id) : undefined;
  const avatarUser = profileUser
    ? {
        ...profileUser,
        // GET /users/:id omits identities; preserve the authorized email for Gravatar.
        email:
          normalizeGravatarEmail(profileUser.email) ??
          normalizeGravatarEmail(contextOrganizationLoggedInUser?.email) ??
          normalizeGravatarEmail(loggedInUser?.email),
      }
    : contextOrganizationLoggedInUser || loggedInUser;

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSelectLanguageModalOpen, setIsSelectLanguageModalOpen] = useState(false);

  useEffect(() => {
    fetchContextOrganizationUsers().catch(() => undefined);
  }, []);

  useEffect(() => {
    dayjs.locale(i18n.language);
  }, [i18n.language]);

  const handleLogout = (): void => {
    void logout().then(() => navigate(authPaths.login));
  };

  const toggleUserMenu = (): void => {
    setIsUserMenuOpen(!isUserMenuOpen);
  };

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const handleOpenChangeLanguageModal = (): void => {
    setIsSelectLanguageModalOpen(true);
    setIsUserMenuOpen(false);
    setIsMenuOpen(false);
  };

  const changeLanguage = (language: string): void => {
    changeUserLanguage(language);
    void i18n.changeLanguage(language);
    dayjs.locale(language);
    setIsSelectLanguageModalOpen(false);
  };

  const handleClickOutside = useCallback(() => {
    if (isUserMenuOpen) setIsUserMenuOpen(false);
  }, [isUserMenuOpen]);

  useOnClickOutside({
    ref: dropdownRef,
    handler: handleClickOutside,
  });

  return (
    <div ref={dropdownRef}>
      <button className={styles.settingsBtn} data-testid="user-avatar-menu-button" onClick={toggleUserMenu}>
        <div className={styles.userInformation} data-active={isUserMenuOpen}>
          <Avatar isNavbar user={avatarUser} />
          <div className={styles.arrowRightBox}>
            <Icon icon={icons.arrowRight} width={7} height={12} />
          </div>
        </div>
      </button>
      {isUserMenuOpen && (
        <div className={styles.dropdownMenuContainer}>
          <ul className={styles.dropdownMenu}>
            <Button
              maxWidth
              className={styles.languageBtn}
              label={t('common.change_language')}
              onClick={handleOpenChangeLanguageModal}
              size="small"
              variant="outlined"
              color="fontHeading"
              startIcon={<Icon icon={icons.language} height={32} />}
            />
            <li className={styles.avatarLinkItem} hidden={isDemo}>
              <Button
                maxWidth
                href="https://gravatar.com/profile/avatars"
                target="_blank"
                rel="noopener noreferrer"
                label={t('common.change_avatar')}
                aria-label={t('common.change_avatar_gravatar')}
                title={t('common.change_avatar_gravatar')}
                size="small"
                variant="outlined"
                color="fontHeading"
              />
            </li>
            <Button
              maxWidth
              className={styles.workspaceCheckoutBtn}
              label={t('common.change_workspace')}
              onClick={checkoutFromWorkspace}
              size="small"
              variant="outlined"
              color="fontHeading"
              hidden={!hasMoreThanOneOrganization}
            />
            <Button
              maxWidth
              dataTestId="user-avatar-menu-logout-button"
              label={t('common.logout')}
              hidden={isDemo}
              onClick={handleLogout}
              size="small"
              variant="contained"
            />
          </ul>
        </div>
      )}
      <Modal
        className={styles.draftsModal}
        isOpen={isSelectLanguageModalOpen}
        close={() => setIsSelectLanguageModalOpen(false)}
      >
        <h3>{t('common.change_language')}</h3>
        <div className={styles.languageSelector}>
          {Object.keys(resources).map((language, i) => (
            <Button key={i} size="small" label={t(`common.${language}`)} onClick={() => changeLanguage(language)} />
          ))}
        </div>
      </Modal>
    </div>
  );
}

export default UserAvatarMenu;
