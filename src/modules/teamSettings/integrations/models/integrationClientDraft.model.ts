import { OAUTH_SCOPES } from '@/modules/integrationClients/models/integrationClientDto.model';
import type { CreateIntegrationClientInput, OAuthScope } from '@/modules/integrationClients/types';
import { z } from 'zod';

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

const hasLocalComponents = (
  date: Date,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): boolean =>
  date.getFullYear() === year &&
  date.getMonth() === month &&
  date.getDate() === day &&
  date.getHours() === hour &&
  date.getMinutes() === minute &&
  date.getSeconds() === second &&
  date.getMilliseconds() === millisecond;

// Parses a `datetime-local` input value in the browser's own timezone. Rejects DST-gap values
// (the local time never occurred) and DST-fold values (the local time is ambiguous) by re-deriving
// the local components a few hours to either side of the parsed instant and checking the offset
// actually shifted -- a naive `new Date(y, m, d, h, min)` construction silently normalizes those.
export const parseLocalDateTime = (value: string): string | null => {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', millisecondText = '0'] = match;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(millisecondText.padEnd(3, '0'));
  if (month < 0 || month > 11 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;

  const parsed = new Date(year, month, day, hour, minute, second, millisecond);
  if (
    Number.isNaN(parsed.getTime()) ||
    !hasLocalComponents(parsed, year, month, day, hour, minute, second, millisecond)
  ) {
    return null;
  }

  const beforeOffset = new Date(parsed.getTime() - 3 * 60 * 60 * 1000).getTimezoneOffset();
  const afterOffset = new Date(parsed.getTime() + 3 * 60 * 60 * 1000).getTimezoneOffset();
  const offsetShift = Math.abs(afterOffset - beforeOffset) * 60 * 1000;
  if (
    offsetShift > 0 &&
    [parsed.getTime() - offsetShift, parsed.getTime() + offsetShift].some((timestamp) =>
      hasLocalComponents(new Date(timestamp), year, month, day, hour, minute, second, millisecond),
    )
  ) {
    return null;
  }

  return parsed.toISOString();
};

export const toLocalDateTimeInput = (utcTimestamp: string): string => {
  const date = new Date(utcTimestamp);
  if (Number.isNaN(date.getTime())) return '';

  const base = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return date.getMilliseconds() === 0 ? base : `${base}.${pad(date.getMilliseconds(), 3)}`;
};

const stableScopes = (scopes: readonly OAuthScope[]): OAuthScope[] =>
  OAUTH_SCOPES.filter((scope) => scopes.includes(scope));

export interface IntegrationClientDraftInput {
  name: string;
  scopes: OAuthScope[];
  projectAccessMode: 'AllProjects' | 'SelectedProjects';
  projectIds: string[];
  expirationMode: 'expires' | 'none';
  expiresAtLocal: string;
}

export interface ValidatedIntegrationClientDraft {
  name: string;
  scopes: OAuthScope[];
  projectAccess: CreateIntegrationClientInput['projectAccess'];
  expiresAt: string | null;
}

type DraftFieldErrorCode = 'required' | 'invalid' | 'future';

// Every issue's message IS the exact i18n key IntegrationClientFormModal already builds dynamically
// (`team_seatings.integrations.form.error.<field>.<code>`) -- see translation.json. Keeping the
// message and the field/code pair in one string (rather than a separate lookup table) means the two
// can't drift apart.
const fieldErrorKey = (field: string, code: DraftFieldErrorCode): string =>
  `team_seatings.integrations.form.error.${field}.${code}`;

const addFieldIssue = (ctx: z.RefinementCtx, field: string, code: DraftFieldErrorCode): void => {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: fieldErrorKey(field, code) });
};

const DraftShape = z.object({
  name: z.string(),
  scopes: z.array(z.string()),
  projectAccessMode: z.enum(['AllProjects', 'SelectedProjects']),
  projectIds: z.array(z.string()),
  expirationMode: z.enum(['expires', 'none']),
  expiresAtLocal: z.string(),
});

// A concrete schema per validation context rather than a generic "operation" factory: create and
// edit/renew share every rule below except how expiresAt is sourced -- an update whose local
// timestamp string is untouched reuses the client's already-valid `expiresAt` instant instead of
// re-parsing it (see buildUpdateIntegrationClientInput's `preservedExpiresAt`), which a static
// schema can't express, so it stays a parameter rather than being duplicated into two schemas.
export const IntegrationClientDraftSchema = (
  activeProjectIds: readonly string[],
  now: Date,
  preservedExpiresAt?: string,
): z.ZodEffects<typeof DraftShape, ValidatedIntegrationClientDraft> =>
  DraftShape.transform((draft, ctx): ValidatedIntegrationClientDraft => {
    const name = draft.name.trim();
    if (!name) addFieldIssue(ctx, 'name', 'required');

    const rawScopes = draft.scopes as OAuthScope[];
    const hasInvalidScope = rawScopes.some((scope) => !OAUTH_SCOPES.includes(scope));
    const scopes = stableScopes(rawScopes);
    if (hasInvalidScope) addFieldIssue(ctx, 'scopes', 'invalid');
    else if (scopes.length === 0) addFieldIssue(ctx, 'scopes', 'required');

    const uniqueProjectIds = Array.from(new Set(draft.projectIds));
    let projectAccess: CreateIntegrationClientInput['projectAccess'] = { mode: 'AllProjects' };
    if (draft.projectAccessMode === 'SelectedProjects') {
      if (uniqueProjectIds.length === 0) addFieldIssue(ctx, 'projects', 'required');
      else if (uniqueProjectIds.some((projectId) => !activeProjectIds.includes(projectId))) {
        addFieldIssue(ctx, 'projects', 'invalid');
      } else projectAccess = { mode: 'SelectedProjects', projectIds: uniqueProjectIds };
    }

    let expiresAt: string | null = null;
    if (draft.expirationMode === 'expires') {
      expiresAt = preservedExpiresAt ?? parseLocalDateTime(draft.expiresAtLocal);
      if (expiresAt === null) addFieldIssue(ctx, 'expiresAt', 'invalid');
      else if (new Date(expiresAt).getTime() <= now.getTime()) addFieldIssue(ctx, 'expiresAt', 'future');
    }

    return { name, scopes, projectAccess, expiresAt };
  });
