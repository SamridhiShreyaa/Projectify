import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const Signup = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Secret codes do not match!');
            return;
        }

        if (password.length < 6) {
            setError('Secret code must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            const res = await api.post('/auth/signup', { email, password, name: name.trim() || undefined });
            login(res.data.token, res.data.email, res.data.name);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || 'Registration failed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="pixel-card auth-card slide-up">
                <div className="auth-header">
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }} className="pixel-float">🧙‍♂️</div>
                    <h1 className="glow-pink">NEW PLAYER</h1>
                    <p>Create your hero profile and start questing</p>
                    <div style={{
                        margin: '1rem auto 0',
                        fontFamily: 'var(--pixel-font)',
                        fontSize: '0.4rem',
                        color: 'var(--pixel-dim)',
                        letterSpacing: '0.2em'
                    }}>
                        ═══════ CHARACTER SELECT ═══════
                    </div>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    {error && <div className="error-message">⚠ {error}</div>}

                    <div className="form-group">
                        <label className="form-label" htmlFor="signup-name">🧝 Display Name <span style={{ opacity: 0.5 }}>(optional)</span></label>
                        <input
                            id="signup-name"
                            className="form-input"
                            type="text"
                            placeholder="Your hero name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={50}
                            autoComplete="name"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="signup-email">📧 Player Email</label>
                        <input
                            id="signup-email"
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
                        <label className="form-label" htmlFor="signup-password">🔒 Secret Code</label>
                        <input
                            id="signup-password"
                            className="form-input"
                            type="password"
                            placeholder="Min. 6 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="signup-confirm">🔒 Confirm Code</label>
                        <input
                            id="signup-confirm"
                            className="form-input"
                            type="password"
                            placeholder="Repeat your code"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg"
                        disabled={loading}
                        style={{ width: '100%', marginTop: '0.5rem' }}
                    >
                        {loading ? <span className="spinner"></span> : '⚔ CREATE CHARACTER'}
                    </button>
                </form>

                <div className="auth-footer">
                    Already a player?{' '}
                    <Link to="/login">Insert Coin →</Link>
                </div>
            </div>
        </div>
    );
};

export default Signup;
