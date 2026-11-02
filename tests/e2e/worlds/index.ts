import { buildWorldFromRegistry } from './buildWorld';
import type { BuiltWorld, WorldName } from './types';
import { world1 } from './world-1';
import { world2 } from './world-2';
import { world3 } from './world-3';
import { world4 } from './world-4';
import { world5 } from './world-5';
import { world6 } from './world-6';

export const WORLD_NAMES: WorldName[] = ['world-1', 'world-2', 'world-3', 'world-4', 'world-5', 'world-6'];

const registry = {
  'world-1': world1,
  'world-2': world2,
  'world-3': world3,
  'world-4': world4,
  'world-5': world5,
  'world-6': world6,
};

export const buildWorld = (name: WorldName): BuiltWorld => buildWorldFromRegistry(name, registry);

export type { ActorName, BuiltWorld, WorldFailure, WorldName } from './types';
