import React from 'react';

export type Role = 'Viewer' | 'Analyst' | 'ProcessEng' | 'QA' | 'RegCMC' | 'Admin';

export const RoleCtx = React.createContext<{ role: Role; setRole: (r: Role) => void }>({
  role: 'Viewer',
  setRole: () => {},
});

function safeGetRole(): Role {
  try { return (localStorage.getItem('role') as Role) || 'Admin'; } catch { return 'Admin'; }
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = React.useState<Role>(safeGetRole);

  React.useEffect(() => {
    try { localStorage.setItem('role', role); } catch { /* private browsing */ }
  }, [role]);

  return <RoleCtx.Provider value={{ role, setRole }}>{children}</RoleCtx.Provider>;
}

export function useRole() {
  return React.useContext(RoleCtx);
}
