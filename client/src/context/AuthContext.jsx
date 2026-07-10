import { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [email, setEmail] = useState(localStorage.getItem('email'));
    const [name, setName] = useState(localStorage.getItem('name'));

    const login = (t, userEmail, userName) => {
        localStorage.setItem('token', t);
        if (userEmail) localStorage.setItem('email', userEmail);
        if (userName) localStorage.setItem('name', userName);
        setToken(t);
        setEmail(userEmail || null);
        setName(userName || null);
    };

    // Reflect settings changes (email/name) into context + storage without re-login
    const updateUser = ({ email: newEmail, name: newName }) => {
        if (newEmail !== undefined) {
            localStorage.setItem('email', newEmail);
            setEmail(newEmail);
        }
        if (newName !== undefined) {
            localStorage.setItem('name', newName);
            setName(newName);
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        localStorage.removeItem('name');
        setToken(null);
        setEmail(null);
        setName(null);
    };

    const isAuthenticated = !!token;

    return (
        <AuthContext.Provider value={{ token, email, name, login, updateUser, logout, isAuthenticated }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
