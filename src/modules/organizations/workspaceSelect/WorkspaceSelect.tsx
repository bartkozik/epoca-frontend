import { paths } from '@/app/routing/paths';
import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import ItemLogo from '@/core/theme/itemLogo';
import LoadingArea from '@/core/theme/loadingArea';
import LogoImage from '@/core/theme/logoImage';
import Tooltip from '@/core/theme/tooltip';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { useAuth } from '@/modules/auth/AuthProvider';
import { authPaths } from '@/modules/auth/routes';
import { useOrganizationsQuery } from '@/modules/organizations/hooks/useOrganizationsQuery';
import { toOrganization } from '@/modules/organizations/modelOrganization';
import { classifyOrganizationLoadFailure } from '@/modules/organizations/organizationLoadFailure';
import { Organization } from '@/modules/organizations/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { isCancelledError } from '@tanstack/react-query';
import styles from './WorkspaceSelect.module.scss';

interface OrganizationNameProps {
  name: string;
}

const OrganizationName = ({ name }: OrganizationNameProps): JSX.Element => {
  const nameRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const measureTruncation = useCallback(() => {
    const node = nameRef.current;
    if (!node) return;

    const nextIsTruncated = node.scrollWidth > node.clientWidth;
    setIsTruncated((current) => (current === nextIsTruncated ? current : nextIsTruncated));
  }, []);

  useLayoutEffect(measureTruncation, [measureTruncation, name]);

  useEffect(() => {
    const node = nameRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;

    // The layout effect above only re-measures on name change; a width change from window/container
    // resizing needs its own trigger, otherwise isTruncated can go stale relative to the CSS ellipsis.
    const resizeObserver = new ResizeObserver(measureTruncation);
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, [measureTruncation]);

  const nameElement = (
    <p className={styles.name} ref={nameRef}>
      {name}
    </p>
  );

  return isTruncated ? (
    <Tooltip className={styles.nameTooltip} content={name}>
      {nameElement}
    </Tooltip>
  ) : (
    nameElement
  );
};

const WorkspaceSelect = (): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const auth = useAuth();
  const { logout } = auth;
  const { getContextOrganizationBySlug } = workspace;
  const query = useOrganizationsQuery();
  // CT-561 review fix: derived from this component's own `query.error` rather than a second
  // useOrganizationLoadFailure() hook call, which used to create a second useQuery subscription on
  // the same key and double-fire the error side effects inside useOrganizationsQuery (duplicate
  // toast, duplicate logout()). See organizationList.model.ts's comment above useHasMoreThanOneOrganization.
  const organizationLoadFailure = query.error ? classifyOrganizationLoadFailure(query.error) : null;
  const organizations = (query.data?.results ?? []).map(toOrganization);
  const hasMoreThanOneOrganization = organizations.length > 1;

  useEffect(() => {
    // Mirrors the auto-select effect in useOrganizationsQuery (which resolves the context
    // organization for a single-org account) -- this is the component's own navigate-away side
    // effect on top of that, reproducing fetchOrganizations().then(navigate) from the old store.
    if (query.data?.results.length === 1) navigate(paths.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the data identity should retrigger this
  }, [query.data]);

  const handleOrganizationSelect = (organization: Organization): void => {
    void getContextOrganizationBySlug(organization.slug)
      .then(() => navigate(paths.index))
      .catch((error: unknown) => {
        // The provider observes the active slug, so an unsuccessful selection has no
        // subscribed query to report its error. Logout/reset cancellation stays silent.
        if (!isCancelledError(error)) {
          showModuleErrorToast(error, { default: t('toast_message.organizations.data_fetch_error') });
        }
      });
  };

  const handleLogout = (): void => {
    void logout();
    navigate(authPaths.login);
  };

  const handleRetry = (): void => {
    void query
      .refetch()
      .then((result) => {
        if (result.data?.results.length === 1) navigate(paths.index);
      })
      .catch(() => undefined);
  };

  const renderOrganizations = (): JSX.Element[] | null => {
    if (!hasMoreThanOneOrganization) return null;

    return organizations
      .filter(({ archived, slug }) => !archived && slug)
      .map((organization) => (
        <div
          key={organization.id}
          className={styles.organization}
          onClick={() => handleOrganizationSelect(organization)}
        >
          <div className={styles.nameBox}>
            <ItemLogo item={organization} />
            <OrganizationName name={organization.name || organization.slug} />
          </div>
          <Icon icon={icons.arrowRight} width={16} height={16} />
        </div>
      ));
  };

  const renderWorkspaceList = (): JSX.Element | JSX.Element[] | null => {
    if (organizationLoadFailure?.kind === 'forbidden') {
      return <p>{t('organizations.workspace_select.error.forbidden')}</p>;
    }

    if (organizationLoadFailure?.kind === 'request' || organizationLoadFailure?.kind === 'temporary') {
      return (
        <div>
          <p>{t('organizations.workspace_select.error.temporary')}</p>
          <Button label={t('organizations.workspace_select.button.retry')} onClick={handleRetry} variant="outlined" />
        </div>
      );
    }

    if (organizationLoadFailure?.kind === 'unauthorized') return null;
    if (organizations.length) return renderOrganizations();
    return <p>{t('organizations.workspace_select.text.workspace_data_fetch_error')}</p>;
  };

  return (
    <LoadingArea loading={query.isFetching}>
      <div className={styles.root}>
        <div className={styles.organizationSelectBox}>
          <LogoImage className={styles.logo} to={paths.index} />
          <h1 className={styles.infoSign}>{t('organizations.workspace_select.title.select_workspace')}</h1>
          {renderWorkspaceList()}
          <Button maxWidth label={t('common.logout')} onClick={handleLogout} variant="contained" />
        </div>
      </div>
    </LoadingArea>
  );
};

export default WorkspaceSelect;
