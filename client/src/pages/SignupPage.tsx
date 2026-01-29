import { useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * @deprecated Legacy signup page. Use Concept2Cure Zen signup at /concept2cure/signup.
 */
export default function SignupPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/concept2cure/signup');
  }, [setLocation]);

  return null;
}