import React, { createContext, useContext } from 'react';
import jwtDecode from 'jwt-decode';

export const UserContext = createContext(null);

export function UserProvider({ children }) {
  let token = null;
  try { token = localStorage.getItem('token'); } catch { /* private browsing */ }
  const user = token ? jwtDecode(token) : null; // { id, role, tenantId }
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export const useUser = () => useContext(UserContext);
