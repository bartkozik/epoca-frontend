import { Client } from '../types';
import { ClientFormSchema } from './clientForm.model';

const existingClient = { id: 'client-1', name: 'Acme' } as Client;

describe('ClientFormSchema', () => {
  it('accepts a unique, valid client name with no logo URL', () => {
    const result = ClientFormSchema([existingClient]).safeParse({ clientName: 'New Client', logoURL: '' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty client name with the required-field key', () => {
    const result = ClientFormSchema([existingClient]).safeParse({ clientName: '', logoURL: '' });
    if (result.success) throw new Error('expected validation to fail');
    expect(result.error.issues[0].message).toBe('clients.client_form.error.project_name_required');
  });

  it('rejects a client name too long with the too-long key', () => {
    const result = ClientFormSchema([existingClient]).safeParse({ clientName: 'a'.repeat(300), logoURL: '' });
    if (result.success) throw new Error('expected validation to fail');
    expect(result.error.issues[0].message).toBe('clients.client_form.error.project_name_too_long');
  });

  it('rejects a client name already in use by another client', () => {
    const result = ClientFormSchema([existingClient]).safeParse({ clientName: 'acme', logoURL: '' });
    if (result.success) throw new Error('expected validation to fail');
    expect(result.error.issues[0].message).toBe('common.error.name_is_already_in_use');
  });

  it('allows the current client to keep its own name when editing', () => {
    const result = ClientFormSchema([existingClient], 'client-1').safeParse({ clientName: 'Acme', logoURL: '' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid logo URL', () => {
    const result = ClientFormSchema([existingClient]).safeParse({ clientName: 'New Client', logoURL: 'not-a-url' });
    if (result.success) throw new Error('expected validation to fail');
    expect(result.error.issues[0].message).toBe('common.error.please_enter_a_valid_url');
  });

  it('accepts a valid logo URL', () => {
    const result = ClientFormSchema([existingClient]).safeParse({
      clientName: 'New Client',
      logoURL: 'https://example.com/logo.png',
    });
    expect(result.success).toBe(true);
  });
});
