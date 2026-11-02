import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import ItemLogo from '@/core/theme/itemLogo';
import TableItemName from '@/core/theme/tableItemName';
import { withFromListSearch } from '@/core/utils/helpers';
import { useAuth } from '@/modules/auth/AuthProvider';
import { Client } from '@/modules/clients/types';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { clientsPaths } from '../../routes';
import ClientProjectsList from '../clientProjectsList';
import styles from './ClientRow.module.scss';

const TAB_VALUE = {
  clientDetails: 'client-details',
};

interface ClientRowProps {
  client: Client;
  onArchive: (clientId: string) => void;
  onNewProjectAdd: () => void;
}

const ClientRow = ({ client, onArchive, onNewProjectAdd }: ClientRowProps): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const { hasAccess } = auth;
  const { archived, color, id, name, formattedCreatedAt, type } = client;

  const handleDetailsClick = (clientId: string): void => {
    navigate(clientsPaths.details(clientId, TAB_VALUE.clientDetails), {
      state: withFromListSearch(location.search),
    });
  };

  const restrictedAccess = !hasAccess(ROLE_PERMISSIONS.Manager);

  return (
    <tr>
      <td data-th="Logo">
        <ItemLogo item={client} />
      </td>
      <td data-th="Client">
        <div className={styles.clientBox}>
          <TableItemName color={color} name={name} />
          <div className={styles.clientType}>
            {`${t('clients.clients_board.table_header.type')}`}: <span>{type}</span>
          </div>
          {!archived && <ClientProjectsList client={client} onProjectAdd={onNewProjectAdd} />}
        </div>
      </td>
      <td data-th="Date Added">{formattedCreatedAt}</td>
      <td data-th="Type">{t(`common.${type.toLowerCase()}`)}</td>
      <td>
        <div className={clsx(styles.btnBox, { [styles.btnBoxArchived]: archived })}>
          <IconButton
            className={styles.pencilIcon}
            icon={<Icon icon={icons.pencil} width={16} height={16} />}
            label={t('common.details')}
            onClick={() => handleDetailsClick(id)}
            variant="contained"
          />
          <IconButton
            icon={<Icon icon={icons.archive} width={15} height={19} />}
            label={!archived ? t('common.archive') : t('common.unarchive')}
            onClick={() => onArchive(id)}
            variant="contained"
            hidden={restrictedAccess}
          />
        </div>
      </td>
    </tr>
  );
};

export default ClientRow;
