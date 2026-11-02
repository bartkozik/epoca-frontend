import noItemsImage from '@/core/theme/assets/images/projectsComponentImages/teamWorkImage.png';
import LoadingArea from '@/core/theme/loadingArea';
import MainContent from '@/core/theme/mainContent';
import NoDataFound from '@/core/theme/noDataFound';
import PrimaryHeading from '@/core/theme/primaryHeading';
import SearchBar, { SearchBarProps } from '@/core/theme/searchBar/SearchBar';
import { ClientFilterTypeOption, ClientStatusOption, ProjectStatusOption } from '@/core/utils/option-types';
import { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './DataTableLayout.module.scss';

interface DataTableLayoutProps<T extends ProjectStatusOption | ClientStatusOption, U extends ClientFilterTypeOption> {
  btnLabel: string;
  children: ReactNode;
  isSearchBarVisible: boolean;
  loading: boolean;
  noItemsLabel: string;
  onBtnClick: () => void;
  searchBarProps: SearchBarProps<T, U>;
  title: string;
  headerClassName?: string;
  noDataFoundWithoutButton?: boolean;
}

function DataTableLayout<T extends ProjectStatusOption | ClientStatusOption, U extends ClientFilterTypeOption>({
  headerClassName,
  btnLabel,
  children,
  isSearchBarVisible,
  loading,
  noItemsLabel,
  onBtnClick,
  searchBarProps,
  title,
  noDataFoundWithoutButton = false,
}: DataTableLayoutProps<T, U>): JSX.Element {
  const itemsBoardContainer = <div className={styles.itemsBoard}>{children}</div>;

  const itemsBoardView = isSearchBarVisible ? (
    itemsBoardContainer
  ) : (
    <NoDataFound
      buttonLabel={btnLabel}
      image={noItemsImage}
      label={noItemsLabel}
      onButtonClick={onBtnClick}
      withoutButton={noDataFoundWithoutButton}
    />
  );

  const loadedComponent = (
    <>
      <header className={clsx(styles.header, headerClassName)}>
        <PrimaryHeading>{title}</PrimaryHeading>
        {isSearchBarVisible && <SearchBar {...searchBarProps} />}
      </header>
      {itemsBoardView}
    </>
  );

  return (
    <MainContent>
      <LoadingArea loading={loading}>{loadedComponent}</LoadingArea>
    </MainContent>
  );
}

export default DataTableLayout;
