import type { MockHandler } from './types';

const AUDIT_DATE = '2026-01-01T00:00:00.000Z';

export const userHandlers: MockHandler[] = [
  {
    id: 'user-by-id',
    method: 'GET',
    path: /^\/users\/[^/]+$/,
    handle: (request, runtime) => {
      const userId = request.path.split('/').at(-1);
      const user = runtime.state.users.find(({ id }) => id === userId);
      if (!user) return { status: 404, json: { message: 'User not found' } };

      return {
        status: 200,
        json: {
          archivedAt: user.archived ? AUDIT_DATE : '',
          avatar: user.avatar ?? '',
          color: '',
          createdAt: AUDIT_DATE,
          firstName: user.firstName,
          id: user.id,
          isSuperAdmin: false,
          lastName: user.lastName,
          modifiedAt: AUDIT_DATE,
        },
      };
    },
  },
];
