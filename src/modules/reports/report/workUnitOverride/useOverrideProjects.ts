import type { SelectOption } from '@/core/theme/inputs/types';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import type { WorkUnitOverrideResponse } from '@/modules/reports/models/workUnitOverride.model';
import { useEffect, useRef, useState } from 'react';

interface OverrideProjects {
  clientOptions: SelectOption[];
  projectOptions: SelectOption[];
  projectResolution: 'resolving' | 'unavailable' | null;
  resolveClient: (id: string | null) => string | null;
}

// Catalog resolution is session-scoped; historical names never pass through this helper.
export function useOverrideProjects(
  base: WorkUnitOverrideResponse | null,
  projectId: string | null | undefined,
  clientId: string | null,
  sessionKey: string,
): OverrideProjects {
  const projectsContext = useProjects();
  const attempted = useRef(false);
  const generation = useRef(0);
  const [status, setStatus] = useState<'idle' | 'resolving' | 'resolved'>('idle');
  useEffect(() => {
    generation.current += 1;
    attempted.current = false;
    setStatus('idle');
    return () => {
      generation.current += 1;
    };
  }, [sessionKey]);
  useEffect(() => {
    if (!base || attempted.current) return;
    const available = new Set(
      projectsContext.reportedProjects.filter((project) => !project.archived).map((project) => project.id),
    );
    const missing =
      base.override.permissions.allowedProjectIds.some((id) => !available.has(id)) ||
      Boolean(projectId && !available.has(projectId));
    if (!missing) {
      setStatus('resolved');
      return;
    }
    attempted.current = true;
    const requestGeneration = generation.current;
    setStatus('resolving');
    void Promise.resolve(projectsContext.fetchProjects(true))
      .catch(() => undefined)
      .finally(() => {
        if (requestGeneration === generation.current) setStatus('resolved');
      });
  }, [base, projectId, projectsContext, sessionKey]);
  const eligible = base
    ? projectsContext.reportedProjects.filter(
        (project) => !project.archived && base.override.permissions.allowedProjectIds.includes(project.id),
      )
    : [];
  const clients = new Map(
    eligible.map((project) => [project.client.id, { value: project.client.id, label: project.client.name }]),
  );
  for (const value of [base?.projectClient, base?.effectiveProjectClient]) {
    if (value) clients.set(value.clientId, { value: value.clientId, label: value.clientName });
  }
  const projectOptions = eligible
    .filter((project) => project.client.id === clientId)
    .map((project) => ({ value: project.id, label: project.name }));
  const projectResolution =
    projectId && !projectOptions.some((option) => option.value === projectId)
      ? status === 'resolved'
        ? 'unavailable'
        : 'resolving'
      : null;
  const resolveClient = (id: string | null): string | null =>
    id === null
      ? (base?.projectClient?.clientId ?? null)
      : (projectsContext.reportedProjects.find((project) => project.id === id)?.client.id ??
        (base?.effectiveProjectClient?.projectId === id ? base.effectiveProjectClient.clientId : null));
  return {
    clientOptions: [...clients.values()].sort((a, b) => a.label.localeCompare(b.label)),
    projectOptions,
    projectResolution,
    resolveClient,
  };
}
