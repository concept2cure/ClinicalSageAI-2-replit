import { useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * @deprecated Legacy auth page. Use Concept2Cure Zen login at /concept2cure/login.
 */
export default function AuthPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/concept2cure/login');
  }, [setLocation]);

  return null;
}
