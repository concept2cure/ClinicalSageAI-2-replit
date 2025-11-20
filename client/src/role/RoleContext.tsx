import React from 'react';

export type Role = 'Viewer' | 'Analyst' | 'ProcessEng' | 'QA' | 'RegCMC' | 'Admin';

export const RoleCtx = React.createContext<{ role: Role; setRole: (r: Role) => void }>({
  role: 'Viewer',
  setRole: () => {},
});

export function RoleProvider({ children }: { children: any }) {
  const [role, setRole] = React.useState<Role>((localStorage.getItem('role') as Role) || 'Admin');

  React.useEffect(() => {
    localStorage.setItem('role', role);
  }, [role]);

  return <RoleCtx.Provider value={{ role, setRole }}>{children}</RoleCtx.Provider>;
}

export function useRole() {
  return React.useContext(RoleCtx);
}
