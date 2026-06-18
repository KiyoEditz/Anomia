import { createContext, useContext, useEffect, useState } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('anomia_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((r) => setUser(r.data.user))
      .catch(() => localStorage.removeItem('anomia_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const r = await api.post('/auth/login', { username, password });
    localStorage.setItem('anomia_token', r.data.token);
    setUser(r.data.user);
  }

  async function register(username, password, displayName) {
    const r = await api.post('/auth/register', { username, password, displayName });
    localStorage.setItem('anomia_token', r.data.token);
    setUser(r.data.user);
  }

  function logout() {
    localStorage.removeItem('anomia_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
