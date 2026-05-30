import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await api.post('/auth/login', { email, password });
            login(res.data.token, res.data.email);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || 'Connection failed. Is the server running?');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="pixel-card auth-card slide-up">
                <div className="auth-header">
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }} className="pixel-float">🎮</div>
                    <h1 className="glow-cyan">INSERT COIN</h1>
                    <p>Enter your credentials to continue your quest</p>
                    <div style={{
                        margin: '1rem auto 0',
                        fontFamily: 'var(--pixel-font)',
                        fontSize: '0.4rem',
                        color: 'var(--pixel-dim)',
                        letterSpacing: '0.2em'
                    }}>
                        ═══════ PLAYER LOGIN ═══════
                    </div>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    {error && <div className="error-message">⚠ {error}</div>}

                    <div className="form-group">
                        <label className="form-label" htmlFor="login-email">📧 Player Email</label>
                        <input
                            id="login-email"
                            className="form-input"
                            type="email"
                            placeholder="hero@quest.gg"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="login-password">🔒 Secret Code</label>
                        <input
                            id="login-password"
                            className="form-input"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg"
                        disabled={loading}
                        style={{ width: '100%', marginTop: '0.5rem' }}
                    >
                        {loading ? <span className="spinner"></span> : '▶ PRESS START'}
                    </button>
                </form>

                <div className="auth-footer">
                    New player?{' '}
                    <Link to="/signup">Create Character →</Link>
                </div>
            </div>
        </div>
    );
};

export default Login;
