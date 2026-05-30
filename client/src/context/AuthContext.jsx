import { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [email, setEmail] = useState(localStorage.getItem('email'));

    const login = (t, userEmail) => {
        localStorage.setItem('token', t);
        if (userEmail) localStorage.setItem('email', userEmail);
        setToken(t);
        setEmail(userEmail || null);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        setToken(null);
        setEmail(null);
    };

    const isAuthenticated = !!token;

    return (
        <AuthContext.Provider value={{ token, email, login, logout, isAuthenticated }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
