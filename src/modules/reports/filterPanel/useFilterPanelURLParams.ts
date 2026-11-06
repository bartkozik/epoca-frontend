import { SelectOption } from '@/core/theme/inputs';
import { SelectedItemsMap, UpdateSelectedOptionProps } from '@/modules/reports/filterPanel/types';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface UseFilterPanelURLParamsProps {
  clientsSearchOptions: SelectOption[];
  projectsSearchOptions: SelectOption[];
  contextOrganizationUserSearchOptions: SelectOption[];
  handleUpdateSelectedOptions: (options: UpdateSelectedOptionProps) => void;
}

interface UseFilterPanelURLParamsReturn {
  setURLParams: (updates: Record<string, string | null>) => void;
}

const LEGACY_KEYS = ['pmFilters', 'pmProjects', 'pmClients', 'isContextualFiltering'];

const parseURLParamsToFilterTagsRecord = (
  params: URLSearchParams,
  key: string,
  options: SelectOption[],
): SelectedItemsMap => {
  const selectedItemIds = params.get(key)?.split(',').filter(Boolean) ?? [];

  return selectedItemIds.reduce((acc, itemId) => {
    const option = options.find((candidate) => candidate.value === itemId);
    acc[itemId] = option?.label ?? itemId;
    return acc;
  }, {} as SelectedItemsMap);
};

export const useFilterPanelURLParams = ({
  clientsSearchOptions,
  contextOrganizationUserSearchOptions,
  projectsSearchOptions,
  handleUpdateSelectedOptions,
}: UseFilterPanelURLParamsProps): UseFilterPanelURLParamsReturn => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const setURLParams = (updates: Record<string, string | null>): void => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    });
    if (next.toString() === searchParams.toString()) return;
    navigate({ search: next.toString() }, { replace: true });
  };

  useEffect(() => {
    const paramsFromURL = new URLSearchParams(searchParams.toString());
    const newSelectedClients = parseURLParamsToFilterTagsRecord(paramsFromURL, 'clients', clientsSearchOptions);
    const newSelectedProjects = parseURLParamsToFilterTagsRecord(paramsFromURL, 'projects', projectsSearchOptions);
    const newSelectedUsers = parseURLParamsToFilterTagsRecord(
      paramsFromURL,
      'users',
      contextOrganizationUserSearchOptions,
    );

    handleUpdateSelectedOptions({ newSelectedClients, newSelectedProjects, newSelectedUsers });
  }, [clientsSearchOptions, projectsSearchOptions, contextOrganizationUserSearchOptions, searchParams]);

  useEffect(() => {
    if (!LEGACY_KEYS.some((key) => searchParams.has(key))) return;
    const next = new URLSearchParams(searchParams.toString());
    LEGACY_KEYS.forEach((key) => next.delete(key));
    navigate({ search: next.toString() }, { replace: true });
  }, [searchParams]);

  return { setURLParams };
};
