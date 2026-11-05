import { isDemo } from '@/core/config/demo';
import { paths } from '@/app/routing/paths';
import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import Icon, { icons } from '@/core/theme/icon';
import LogoImage from '@/core/theme/logoImage';
import MainContent from '@/core/theme/mainContent';
import { KeyBoardEventType, useKeyDown, useOnClickOutside } from '@/core/utils/hooks';
import { useAuth } from '@/modules/auth/AuthProvider';
import { clientsPaths } from '@/modules/clients/routes';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { projectsPaths } from '@/modules/projects/routes';
import { reportPaths } from '@/modules/reports/report/routes';
import { teamSettingsPaths } from '@/modules/teamSettings/routes';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import clsx from 'clsx';
import Hamburger from './Hamburger';
import styles from './Navbar.module.scss';
import UserAvatarMenu from './UserAvatarMenu';

type NavItem = {
  icon: JSX.Element;
  label: string;
  to: string;
  value: string;
  requiredPermissions?: keyof typeof ROLE_PERMISSIONS;
};

function Navbar(): JSX.Element {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const params = useParams();

  const auth = useAuth();
  const { hasAccessInOrganization, userChosenLanguage } = auth;
  const { contextOrganizationId } = useWorkspace();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  const NAV_ITEMS: NavItem[] = [
    {
      icon: <Icon icon={icons.clock} width={19} height={19} />,
      label: t('common.working_time'),
      to: paths.index,
      value: 'working-time',
    },
    {
      icon: <Icon icon={icons.user} width={15} height={18} />,
      label: t('common.clients'),
      to: clientsPaths.main,
      value: 'clients',
      requiredPermissions: 'Internal',
    },
    {
      icon: <Icon icon={icons.cabinet} />,
      label: t('common.projects'),
      to: projectsPaths.main,
      value: 'projects',
      requiredPermissions: 'Internal',
    },

    {
      icon: <Icon icon={icons.chart} width={20} height={20} />,
      label: t('common.reports'),
      to: reportPaths.main,
      value: 'report',
      requiredPermissions: 'All',
    },
    {
      icon: <Icon icon={icons.cog} width={20} height={20} />,
      label: t('common.team_seatings'),
      to: teamSettingsPaths.teamSettings('members', 'list'),
      value: 'team-settings',
      requiredPermissions: 'Owner',
    },
  ];

  const isActiveNavItem = ({ value }: NavItem): boolean => {
    const pathnameWithoutUrlParams = Object.values(params).reduce((currentPath, paramToRemove) => {
      if (!currentPath || !paramToRemove) return currentPath;
      return currentPath.replace(paramToRemove, '');
    }, location.pathname);

    if (!pathnameWithoutUrlParams) return false;

    return pathnameWithoutUrlParams.includes(value);
  };

  useEffect(() => {
    if (userChosenLanguage) void i18n.changeLanguage(userChosenLanguage);
  }, []);

  useEffect(() => {
    if (!isMenuOpen || !menuRef.current) return;
    menuRef.current.focus();
  }, [isMenuOpen]);

  useOnClickOutside({
    ref: [menuRef, openMenuButtonRef],
    handler: () => setIsMenuOpen(false),
  });

  useKeyDown({
    keyboardEventType: KeyBoardEventType.ESC,
    action: () => setIsMenuOpen(false),
    isListening: true,
  });

  const userHasRequiredPermissions = (item: NavItem): boolean => {
    if (isDemo && item.value === 'team-settings') return false;
    if (!item.requiredPermissions) return true;

    const requiredRoles = ROLE_PERMISSIONS[item.requiredPermissions];
    return hasAccessInOrganization(contextOrganizationId ?? '', requiredRoles);
  };

  return (
    <div className={styles.root}>
      <MainContent>
        <div className={styles.headerInner}>
          <LogoImage className={styles.logo} to={paths.index} />
          <div className={clsx(styles.menu, { [styles.menuActive]: isMenuOpen })} ref={menuRef} tabIndex={1}>
            <nav className={styles.nav}>
              <ul className={styles.navList}>
                {NAV_ITEMS.filter(userHasRequiredPermissions).map((n, i) => (
                  <li key={n.label} className={styles.navItem} data-active={isActiveNavItem(n)}>
                    <Link
                      className={clsx(styles.navLink, {
                        [styles.navLinkActive]: isActiveNavItem(n),
                      })}
                      to={n.to}
                      onClick={(e) => isActiveNavItem(n) && e.preventDefault()}
                      tabIndex={1}
                    >
                      <div className={styles.navBox}>
                        <div className={styles.navContent}>
                          <div className={styles.navIconBox}>{n.icon}</div>
                          <p className={styles.navLabel}>{n.label}</p>
                          <div className={styles.arrowRightBox}>
                            <Icon icon={icons.arrowRight} />
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <UserAvatarMenu setIsMenuOpen={setIsMenuOpen} />
          </div>
          <Hamburger isOpen={isMenuOpen} toggle={() => setIsMenuOpen((prev) => !prev)} buttonRef={openMenuButtonRef} />
        </div>
      </MainContent>
    </div>
  );
}

export default Navbar;
