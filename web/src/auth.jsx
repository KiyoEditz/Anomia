import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const token = localStorage.getItem('anomia_token');
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const socketConn = io(socketUrl, {
      auth: { token },
      withCredentials: true,
    });

    socketConn.on('connect', () => {
      console.log('Connected to real-time notification socket');
    });

    socketConn.on('connect_error', (err) => {
      if (err.message && err.message.includes('SOCKET_UNAUTHORIZED')) {
        // Token expired / tidak valid — bersihkan sesi & arahkan ke login.
        localStorage.removeItem('anomia_token');
        window.location.href = '/login';
      }
    });

    socketConn.on('new_notification', (notif) => {
      console.log('Received real-time notification:', notif);
      setUnreadCount((prev) => prev + 1);
    });

    setSocket(socketConn);

    api.get('/notifications/unread-count')
      .then((r) => setUnreadCount(r.data.unreadCount || 0))
      .catch((err) => console.error('Failed to get unread count:', err));

    return () => {
      socketConn.disconnect();
    };
  }, [user]);

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

  async function login(username, password, extraFields = {}) {
    const r = await api.post('/auth/login', { username, password, ...extraFields });
    localStorage.setItem('anomia_token', r.data.token);
    setUser(r.data.user);
  }

  async function register(username, password, displayName, extraFields = {}) {
    const r = await api.post('/auth/register', { username, password, displayName, ...extraFields });
    localStorage.setItem('anomia_token', r.data.token);
    setUser(r.data.user);
  }

  function logout() {
    localStorage.removeItem('anomia_token');
    setUser(null);
    setUnreadCount(0);
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, setUser, login, register, logout, loading, unreadCount, setUnreadCount, socket }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
