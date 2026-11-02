import { withOrganizationUserEmails } from './with-organization-user-emails';

it('joins only already available emails by id without mutating users or replacing an existing email', () => {
  const users = [{ id: 'one' }, { id: 'two', email: 'own@example.com' }, { id: 'three' }];
  expect(
    withOrganizationUserEmails(users, [
      { id: 'one', email: 'one@example.com' },
      { id: 'two', email: 'other@example.com' },
    ]),
  ).toEqual([
    { id: 'one', email: 'one@example.com' },
    { id: 'two', email: 'own@example.com' },
    { id: 'three', email: undefined },
  ]);
  expect(users[0]).not.toHaveProperty('email');
});
