export type LiveActorName = 'owner' | 'manager' | 'pm' | 'user' | 'employee';

export interface LiveActorCredential {
  email: string;
  password: string;
}

export type LiveActors = Readonly<Record<LiveActorName, Readonly<LiveActorCredential>>>;

const actorEnvironmentPrefixes: Record<LiveActorName, string> = {
  owner: 'PLAYWRIGHT_LIVE_OWNER',
  manager: 'PLAYWRIGHT_LIVE_MANAGER',
  pm: 'PLAYWRIGHT_LIVE_PM',
  user: 'PLAYWRIGHT_LIVE_USER',
  employee: 'PLAYWRIGHT_LIVE_EMPLOYEE',
};

const readCredential = (
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  actor: LiveActorName
): Readonly<LiveActorCredential> => {
  const prefix = actorEnvironmentPrefixes[actor];
  const email = env[`${prefix}_EMAIL`];
  const password = env[`${prefix}_PASSWORD`];
  if (!email?.trim() || !password) throw new Error(`Missing dedicated live credential for ${actor}`);
  return Object.freeze({ email, password });
};

export const loadLiveActors = (env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): LiveActors =>
  Object.freeze({
    owner: readCredential(env, 'owner'),
    manager: readCredential(env, 'manager'),
    pm: readCredential(env, 'pm'),
    user: readCredential(env, 'user'),
    employee: readCredential(env, 'employee'),
  });
