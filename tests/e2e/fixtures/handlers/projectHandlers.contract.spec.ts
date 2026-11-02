import { expect, test } from '@playwright/test';
import { ProjectPatchResultSchema, RawProjectSchema } from '@/modules/projects/models/projectDto.model';
import { buildWorld } from '../../worlds';
import { IDS } from '../../worlds/ids';
import { createWorldRuntime } from '../../worlds/runtime';
import { createMockApiDispatcher, parseMockRequest } from '../mockApi';
import { projectHandlers } from './projectHandlers';

const PROJECT_URL = `http://127.0.0.1:5173/__e2e_api/organizations/epoca-e2e/projects/${IDS.projectLarge}`;

// CT-559: the frontend validates this endpoint's response with ProjectPatchResultSchema (flat
// clientId, no nested client/projectUsers), not RawProjectSchema (the list/get DTO shape) --
// mismatched mock output here previously slipped past every other test and only broke @mr
// specs that actually save an edit.
test('project PATCH response satisfies ProjectPatchResultSchema, not the list/get DTO shape @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-4'));
  const original = runtime.state.projects.find(({ id }) => id === IDS.projectLarge);
  if (!original) throw new Error('world-4 must contain the Large Project fixture');

  const response = await createMockApiDispatcher(runtime, projectHandlers).dispatch(
    parseMockRequest({
      method: 'PATCH',
      url: PROJECT_URL,
      body: {
        name: original.name,
        description: 'CT-559 contract check',
        ownerIds: original.ownerIds,
        memberIds: original.memberIds,
      },
    })
  );

  expect(response.status).toBe(200);
  const patchResult = ProjectPatchResultSchema.safeParse(response.json);
  expect(patchResult.success).toBe(true);
  expect(RawProjectSchema.safeParse(response.json).success).toBe(false);
});
