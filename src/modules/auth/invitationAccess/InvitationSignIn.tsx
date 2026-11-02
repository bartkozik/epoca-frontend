import { useSearchParams } from 'react-router-dom';
import Login from '../login/Login';

const InvitationSignIn = (): JSX.Element => {
  const [search] = useSearchParams();
  const shouldReturnToInvitation = search.get('joined') !== '1' && search.get('sessionRecovery') !== '1';

  return <Login invitationReturn={shouldReturnToInvitation} />;
};

export default InvitationSignIn;
