import { createRequestJournal, type RequestJournal } from '../fixtures/requestJournal';
import type { ActorName, BuiltWorld, WorldFailure, WorldName } from './types';

type Mutable<Value> = Value extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : Value extends object
  ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
  : Value;

export type MutableWorldState = Mutable<BuiltWorld>;

export interface IdempotencyCommand {
  key: string;
  fingerprint: string;
}

export interface IdempotencyClaim<Result> {
  result: Result;
  replayed: boolean;
}

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`Idempotency key ${key} was already claimed with a different fingerprint`);
    this.name = 'IdempotencyConflictError';
  }
}

export interface WorldRuntime {
  readonly worldName: WorldName;
  readonly actor: ActorName;
  readonly publicUrl: string;
  state: MutableWorldState;
  journal: RequestJournal;
  claimIdempotency<Result>(command: IdempotencyCommand, result: Result): IdempotencyClaim<Result>;
  activateFailure(key: WorldFailure['key'] | null): void;
  consumeFailure(key: WorldFailure['key']): WorldFailure | null;
  issueOneTimeOAuthSecret(): string;
  setActor(actor: ActorName): void;
  setPublicUrl(value: string): void;
}

export const createWorldRuntime = (world: BuiltWorld): WorldRuntime => {
  const state = structuredClone(world) as MutableWorldState;
  const outcomes = new Map<string, { fingerprint: string; result: unknown }>();
  const journal = createRequestJournal();
  let actor: ActorName = 'anonymous';
  let publicUrl = '';
  let activeFailure: WorldFailure['key'] | null = null;
  const consumedFailures = new Set<WorldFailure['key']>();

  return {
    worldName: world.name,
    get actor() {
      return actor;
    },
    get publicUrl() {
      return publicUrl;
    },
    state,
    journal,
    issueOneTimeOAuthSecret() {
      if (!state.oauthIntegration) throw new Error(`OAuth integration data is unavailable in ${world.name}`);
      return ['epc', 'secret', 'v1', 'mock', 'runtime', 'only'].join('_');
    },
    activateFailure(key) {
      if (key !== null && !state.failures.some((failure) => failure.key === key)) {
        throw new Error(`Failure ${key} is unavailable in ${world.name}`);
      }
      activeFailure = key;
      consumedFailures.clear();
    },
    consumeFailure(key) {
      if (activeFailure !== key || consumedFailures.has(key)) return null;
      consumedFailures.add(key);
      return state.failures.find((failure) => failure.key === key) ?? null;
    },
    setActor(nextActor) {
      if (nextActor !== 'anonymous' && !state.actors[nextActor]) {
        throw new Error(`Actor ${nextActor} is unavailable in ${world.name}`);
      }
      actor = nextActor;
    },
    setPublicUrl(value) {
      publicUrl = value;
    },
    claimIdempotency(command, result) {
      const previous = outcomes.get(command.key);
      if (previous && previous.fingerprint !== command.fingerprint) {
        throw new IdempotencyConflictError(command.key);
      }
      if (previous) {
        return { result: structuredClone(previous.result) as typeof result, replayed: true };
      }
      outcomes.set(command.key, {
        fingerprint: command.fingerprint,
        result: structuredClone(result),
      });
      return { result, replayed: false };
    },
  };
};
