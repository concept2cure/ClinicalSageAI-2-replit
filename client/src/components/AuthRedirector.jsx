import { useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * @deprecated Legacy auth redirector. Use Concept2Cure routes and portal auth provider.
 */
export default function AuthRedirector() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/concept2cure/login');
  }, [setLocation]);

  return null;
}
