import axios from 'axios';

// VITE_API_URL is the server's origin (e.g. https://projectify-api.onrender.com),
// set at build time for deployments where the client and server are on different
// origins. Left unset, baseURL falls back to a relative '/api' path, which works
// both for the Vite dev proxy (vite.config.js) and same-origin deployments.
const apiOrigin = import.meta.env.VITE_API_URL || '';
const instance = axios.create({
    baseURL: `${apiOrigin}/api`
});

// Automatically attach JWT token to every request
instance.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 responses globally (expired/invalid token)
instance.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('email');
            // Only redirect if not already on auth pages
            if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default instance;
