import type { SelectOption } from '@/core/theme/inputs';
import type { ClientFilterTypeOption } from '@/core/utils/option-types';
import { createContext, useContext } from 'react';
import type { Client, ClientFilterType } from './types';

export interface ClientsContextValue {
  clients: Client[];
  clientsLoadError: Error | null;
  isLoadingClients: boolean;
  client: Client | null;
  selectedClient: Client | null;
  selectedFilterTypeMemberProject: ClientFilterType;
  selectedFilterTypeOptionMembersProjects: ClientFilterTypeOption | undefined;
  isAddClientProjectModalOpen: boolean;
  isLoadingClientDetails: boolean;
  clientsOptions: SelectOption[];
  setClient: (client: Client) => void;
  setSelectedClient: (client: Client | null) => void;
  setSelectedFilterTypeMemberProjects: (type: ClientFilterType) => void;
  handleFilterTypeSelectMemberProjects: (option: ClientFilterTypeOption) => void;
  resetSelectedFilterType: () => void;
  openAddClientProjectModal: (client: Client) => void;
  closeAddClientProjectModal: () => void;
  fetchClients: () => Promise<Client[]>;
  fetchClientProjects: (clientId: string) => Promise<void>;
  removeAllClients: () => void;
}

export const ClientsContext = createContext<ClientsContextValue | undefined>(undefined);

export function useClients(): ClientsContextValue {
  const context = useContext(ClientsContext);
  if (!context) throw new Error('useClients must be used within ClientsProvider');
  return context;
}
