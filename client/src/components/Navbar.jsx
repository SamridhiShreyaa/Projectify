import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
    const { isAuthenticated, email, name, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const isActive = (path) => location.pathname === path ? 'active' : '';

    const playerName = (name || (email ? email.split('@')[0] : 'GUEST')).toUpperCase();

    return (
        <nav className="navbar">
            <Link to="/" className="navbar-brand" style={{ textDecoration: 'none' }}>
                <span className="logo-icon">⚔️</span>
                <span className="gradient-text">PROJECTIFY</span>
            </Link>

            <div className="navbar-links">
                {isAuthenticated ? (
                    <>
                        <Link to="/dashboard" className={`navbar-link ${isActive('/dashboard')}`}>
                            🏠 Dashboard
                        </Link>
                        <Link to="/" className={`navbar-link ${isActive('/')}`}>
                            ⚡ Quests
                        </Link>
                        <Link to="/saved" className={`navbar-link ${isActive('/saved')}`}>
                            📜 Log
                        </Link>
                        <Link to="/review" className={`navbar-link ${isActive('/review')}`}>
                            🔍 Inspect
                        </Link>
                        <Link to="/gallery" className={`navbar-link ${isActive('/gallery')}`}>
                            🏰 Board
                        </Link>
                        <Link to="/profile" title="Account settings" style={{
                            fontFamily: 'var(--pixel-font)',
                            fontSize: '0.45rem',
                            color: 'var(--pixel-gold)',
                            padding: '0.4rem 0.6rem',
                            border: '2px solid var(--pixel-gold)',
                            background: location.pathname === '/profile'
                                ? 'rgba(255,215,0,0.15)'
                                : 'rgba(255,215,0,0.05)',
                            textTransform: 'uppercase',
                            textDecoration: 'none'
                        }}>
                            🎮 {playerName}
                        </Link>
                        <button onClick={handleLogout} className="btn btn-ghost" style={{ fontSize: '0.5rem', padding: '0.4rem 0.6rem' }}>
                            ⏻ Exit
                        </button>
                    </>
                ) : (
                    <>
                        <Link to="/gallery" className={`navbar-link ${isActive('/gallery')}`}>
                            🏰 Board
                        </Link>
                        <Link to="/login" className={`navbar-link ${isActive('/login')}`}>
                            🔑 Login
                        </Link>
                        <Link to="/signup" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.5rem' }}>
                            + New Player
                        </Link>
                    </>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
