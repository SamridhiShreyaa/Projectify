import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Result from './pages/Result';
import Saved from './pages/Saved';
import ReviewRepo from './pages/ReviewRepo';
import Share from './pages/Share';
import Profile from './pages/Profile';
import Gallery from './pages/Gallery';
import Adventurer from './pages/Adventurer';
import Dashboard from './pages/Dashboard';

const NotFound = () => (
    <div className="page-container">
        <div className="container">
            <div className="empty-state">
                <div className="icon">🧭</div>
                <h3>YOU WANDERED OFF THE MAP</h3>
                <p>This path leads nowhere, adventurer.</p>
                <Link to="/" className="btn btn-primary">⚔ Back to the Quest Board</Link>
            </div>
        </div>
    </div>
);

function App() {
    return (
        <AuthProvider>
            <Router>
                <Navbar />
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/share/:token" element={<Share />} />
                    <Route path="/gallery" element={<Gallery />} />
                    <Route path="/adventurer/:handle" element={<Adventurer />} />
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <Home />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <Dashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/result"
                        element={
                            <ProtectedRoute>
                                <Result />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/result/:id"
                        element={
                            <ProtectedRoute>
                                <Result />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/saved"
                        element={
                            <ProtectedRoute>
                                <Saved />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/review"
                        element={
                            <ProtectedRoute>
                                <ReviewRepo />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/profile"
                        element={
                            <ProtectedRoute>
                                <Profile />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;
