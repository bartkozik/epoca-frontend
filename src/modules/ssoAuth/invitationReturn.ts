const SSO_INVITATION_RETURN_STORAGE_KEY = 'epoca:sso-invitation-return';

export function setSsoInvitationReturn(enabled: boolean): void {
  try {
    if (enabled) sessionStorage.setItem(SSO_INVITATION_RETURN_STORAGE_KEY, '1');
    else sessionStorage.removeItem(SSO_INVITATION_RETURN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable. Ordinary SSO still works without this convenience.
  }
}

export function consumeSsoInvitationReturn(): boolean {
  try {
    const enabled = sessionStorage.getItem(SSO_INVITATION_RETURN_STORAGE_KEY) === '1';
    sessionStorage.removeItem(SSO_INVITATION_RETURN_STORAGE_KEY);

    return enabled;
  } catch {
    return false;
  }
}
