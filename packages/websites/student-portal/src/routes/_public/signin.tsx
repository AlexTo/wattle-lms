import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { Spinner } from '../../components/spinner';

export const Route = createFileRoute('/_public/signin')({
  component: RouteComponent,
});

function RouteComponent() {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isAuthenticated && !auth.isLoading) {
      auth.signinRedirect();
    }
  }, [auth]);

  return <Spinner />;
}
