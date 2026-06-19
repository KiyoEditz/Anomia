import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('anomia_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response &&
      error.response.status === 403 &&
      error.response.data &&
      error.response.data.error &&
      (error.response.data.error.includes('ditangguhkan') || error.response.data.error.includes('suspended'))
    ) {
      localStorage.removeItem('anomia_token');
      window.location.href = `/login?error=${encodeURIComponent(error.response.data.error)}`;
    }
    return Promise.reject(error);
  }
);

export default api;
