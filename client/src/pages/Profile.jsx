import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
    });
};

// A settings section with its own inline status line.
const Section = ({ title, icon, children }) => (
    <div className="pixel-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}><span className="icon">{icon}</span> {title}</h3>
        {children}
    </div>
);

const Profile = () => {
    const { updateUser, logout } = useAuth();
    const navigate = useNavigate();

    const [me, setMe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    // Per-section form state
    const [name, setName] = useState('');
    const [nameStatus, setNameStatus] = useState(null);

    const [newEmail, setNewEmail] = useState('');
    const [emailPassword, setEmailPassword] = useState('');
    const [emailStatus, setEmailStatus] = useState(null);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [passwordStatus, setPasswordStatus] = useState(null);

    const [togglingPublic, setTogglingPublic] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);

    const [deletePassword, setDeletePassword] = useState('');
    const [deleteArmed, setDeleteArmed] = useState(false);
    const [deleteStatus, setDeleteStatus] = useState(null);

    useEffect(() => {
        let cancelled = false;
        api.get('/me')
            .then(res => {
                if (cancelled) return;
                setMe(res.data);
                setName(res.data.name || '');
                setNewEmail(res.data.email || '');
            })
            .catch(() => { if (!cancelled) setLoadError('Failed to load your account.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const saveName = async (e) => {
        e.preventDefault();
        setNameStatus(null);
        try {
            const res = await api.patch('/me/profile', { name });
            setMe(m => ({ ...m, name: res.data.name }));
            updateUser({ name: res.data.name });
            setNameStatus({ ok: true, msg: 'Display name updated.' });
        } catch (err) {
            setNameStatus({ ok: false, msg: err.response?.data?.error || 'Could not update name.' });
        }
    };

    const saveEmail = async (e) => {
        e.preventDefault();
        setEmailStatus(null);
        try {
            const res = await api.patch('/me/email', { email: newEmail, current_password: emailPassword });
            setMe(m => ({ ...m, email: res.data.email }));
            updateUser({ email: res.data.email });
            setEmailPassword('');
            setEmailStatus({ ok: true, msg: 'Email updated.' });
        } catch (err) {
            setEmailStatus({ ok: false, msg: err.response?.data?.error || 'Could not update email.' });
        }
    };

    const savePassword = async (e) => {
        e.preventDefault();
        setPasswordStatus(null);
        try {
            await api.patch('/me/password', { current_password: currentPassword, new_password: newPassword });
            setCurrentPassword('');
            setNewPassword('');
            setPasswordStatus({ ok: true, msg: 'Password changed.' });
        } catch (err) {
            setPasswordStatus({ ok: false, msg: err.response?.data?.error || 'Could not change password.' });
        }
    };

    const togglePublic = async () => {
        if (togglingPublic) return;
        setTogglingPublic(true);
        try {
            const res = await api.patch('/me/public-profile', { public_profile: !me.public_profile });
            setMe(m => ({ ...m, public_profile: res.data.public_profile, handle: res.data.handle }));
        } catch {
            /* ignore — toggle simply won't flip */
        } finally {
            setTogglingPublic(false);
        }
    };

    const copyProfileLink = async () => {
        if (!me?.handle) return;
        await navigator.clipboard.writeText(`${window.location.origin}/adventurer/${me.handle}`);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };

    const deleteAccount = async (e) => {
        e.preventDefault();
        setDeleteStatus(null);
        try {
            await api.delete('/me', { data: { current_password: deletePassword } });
            logout();
            navigate('/login');
        } catch (err) {
            setDeleteStatus({ ok: false, msg: err.response?.data?.error || 'Could not delete account.' });
        }
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="loading-overlay">
                        <div className="loading-spinner-lg"></div>
                        <p className="loading-text">Opening your account...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (loadError || !me) {
        return (
            <div className="page-container">
                <div className="container">
                    <div className="error-message">⚠ {loadError || 'Account not found.'}</div>
                </div>
            </div>
        );
    }

    const statusLine = (status) => status && (
        <div style={{
            marginTop: '0.75rem', fontSize: '0.75rem',
            color: status.ok ? 'var(--pixel-green)' : 'var(--pixel-red)'
        }}>
            {status.ok ? '✓ ' : '⚠ '}{status.msg}
        </div>
    );

    return (
        <div className="page-container">
            <div className="container" style={{ maxWidth: '640px' }}>
                <div className="slide-up" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚙️</div>
                    <h1><span className="gradient-text">ACCOUNT SETTINGS</span></h1>
                </div>

                {/* Identity summary */}
                <Section title="Profile" icon="🪪">
                    <div style={{ fontSize: '0.8rem', lineHeight: 1.9 }}>
                        <div><strong>Name:</strong> {me.name}</div>
                        <div><strong>Email:</strong> {me.email}</div>
                        <div><strong>Handle:</strong> <span style={{ color: 'var(--pixel-cyan)' }}>@{me.handle}</span>{' '}
                            <span style={{ opacity: 0.55, fontSize: '0.7rem' }}>(public URL slug — not editable)</span>
                        </div>
                        <div><strong>Member since:</strong> {formatDate(me.createdAt)}</div>
                    </div>
                </Section>

                {/* Display name */}
                <Section title="Display Name" icon="🧝">
                    <form onSubmit={saveName}>
                        <div className="form-group">
                            <input
                                className="form-input"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={50}
                                placeholder="Your hero name"
                                required
                            />
                        </div>
                        <button className="btn btn-primary" type="submit">Save Name</button>
                        {statusLine(nameStatus)}
                    </form>
                </Section>

                {/* Change email */}
                <Section title="Change Email" icon="📧">
                    <form onSubmit={saveEmail}>
                        <div className="form-group">
                            <label className="form-label">New email</label>
                            <input className="form-input" type="email" value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)} required autoComplete="email" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Current password</label>
                            <input className="form-input" type="password" value={emailPassword}
                                onChange={(e) => setEmailPassword(e.target.value)} required autoComplete="current-password" />
                        </div>
                        <button className="btn btn-primary" type="submit">Update Email</button>
                        {statusLine(emailStatus)}
                    </form>
                </Section>

                {/* Change password */}
                <Section title="Change Password" icon="🔒">
                    <form onSubmit={savePassword}>
                        <div className="form-group">
                            <label className="form-label">Current password</label>
                            <input className="form-input" type="password" value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">New password <span style={{ opacity: 0.5 }}>(min. 6 characters)</span></label>
                            <input className="form-input" type="password" value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)} required autoComplete="new-password" />
                        </div>
                        <button className="btn btn-primary" type="submit">Change Password</button>
                        {statusLine(passwordStatus)}
                    </form>
                </Section>

                {/* Public profile */}
                <Section title="Public Adventurer Profile" icon="📣">
                    <p style={{ fontSize: '0.75rem', opacity: 0.85, marginBottom: '0.75rem' }}>
                        Share your level, achievements, and verified quests with a public link —
                        opt-in, and your email is never shown.
                    </p>
                    <button
                        className={`btn ${me.public_profile ? 'btn-secondary' : 'btn-primary'}`}
                        disabled={togglingPublic}
                        onClick={togglePublic}
                    >
                        {togglingPublic ? '…' : me.public_profile ? '🔒 Make Private' : '📣 Make Public'}
                    </button>
                    {me.public_profile && me.handle && (
                        <button className="btn btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={copyProfileLink}>
                            {linkCopied ? '✓ LINK COPIED' : `🔗 Copy /adventurer/${me.handle}`}
                        </button>
                    )}
                </Section>

                {/* Danger zone */}
                <div className="pixel-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderColor: 'var(--pixel-red)' }}>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--pixel-red)' }}><span className="icon">☠️</span> Danger Zone</h3>
                    <p style={{ fontSize: '0.75rem', opacity: 0.85, marginBottom: '0.75rem' }}>
                        Permanently delete your account and all your quests, reviews, and XP. This cannot be undone.
                    </p>
                    {!deleteArmed ? (
                        <button className="btn btn-danger" onClick={() => setDeleteArmed(true)}>
                            🗑 Delete My Account
                        </button>
                    ) : (
                        <form onSubmit={deleteAccount}>
                            <div className="form-group">
                                <label className="form-label">Type your password to confirm</label>
                                <input className="form-input" type="password" value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)} required autoComplete="current-password" />
                            </div>
                            <button className="btn btn-danger" type="submit">Permanently Delete</button>
                            <button type="button" className="btn btn-secondary" style={{ marginLeft: '0.5rem' }}
                                onClick={() => { setDeleteArmed(false); setDeletePassword(''); setDeleteStatus(null); }}>
                                Cancel
                            </button>
                            {statusLine(deleteStatus)}
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Profile;
