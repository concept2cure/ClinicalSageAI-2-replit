import { useEffect } from 'react';
import { useLocation } from 'wouter';

const HomeLanding = () => {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/login');
  }, [setLocation]);

  return null;
};

export default HomeLanding;
