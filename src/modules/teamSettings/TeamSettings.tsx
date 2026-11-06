import { isDemo } from '@/core/config/demo';
import MainContent from '@/core/theme/mainContent';
import PageLayout from '@/core/theme/pageLayout';
import ScrolledContainer from '@/core/theme/scrolledContainer';
import Tabs from '@/core/theme/tabs';
import { useTitle } from '@/core/utils/hooks';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Authentication from './authentication';
import Integrations from './integrations';
import Members from './members';
import { teamSettingsPaths } from './routes';
import styles from './TeamSettings.module.scss';

interface TabsInterface {
  value: string;
  label: string;
  element: JSX.Element;
}

const getCanonicalPath = (tab: string | undefined, memberTab: string | undefined): string | null => {
  if (tab === 'members') {
    return memberTab === 'list' || memberTab === 'invitations'
      ? null
      : teamSettingsPaths.teamSettings('members', 'list');
  }

  if (tab === 'authentication' || tab === 'integrations') {
    return memberTab ? teamSettingsPaths.teamSettings(tab) : null;
  }

  return teamSettingsPaths.teamSettings('members', 'list');
};

function TeamSettings(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { memberTab, tab } = useParams();

  const TABS: TabsInterface[] = [
    {
      value: 'members',
      label: t('team_seatings.tab.members'),
      element: <Members />,
    },

    {
      value: 'authentication',
      label: t('team_seatings.tab.authentication'),
      element: <Authentication />,
    },

    {
      value: 'integrations',
      label: t('team_seatings.tab.integrations'),
      element: <Integrations />,
    },
  ];

  const canonicalPath = getCanonicalPath(tab, memberTab);
  const selectedTab = TABS.find(({ value }) => value === tab) ?? TABS[0];

  useTitle(t('team_seatings.title.team_seatings_name', { name: selectedTab.label }));

  const onTabClick = (value: string): void => {
    if (value === 'members') navigate(teamSettingsPaths.teamSettings(value, 'list'));
    else navigate(teamSettingsPaths.teamSettings(value));
  };

  if (canonicalPath) return <Navigate replace to={canonicalPath} />;

  return (
    <>
      <ScrolledContainer>
        <MainContent>
          <PageLayout className={styles.layout} sectionName={selectedTab.label} title={t('common.team_seatings')}>
            {isDemo && (
              <p>
                {t(
                  tab === 'members' && memberTab !== 'invitations'
                    ? 'team_seatings.demo.members'
                    : 'team_seatings.demo.preview',
                )}
              </p>
            )}
            <Tabs className={styles.tabs} onTabClick={onTabClick} tabs={TABS} />
          </PageLayout>
        </MainContent>
      </ScrolledContainer>
    </>
  );
}

export default TeamSettings;
