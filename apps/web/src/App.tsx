import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './components/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import HomePage from './pages/Home';
import LoginPage from './pages/Login';
import SignupPage from './pages/Signup';
import AuthCallbackPage from './pages/AuthCallback';
import LeaguePage from './pages/League';
import AuctionRoomPage from './pages/AuctionRoom';
import TeamPage from './pages/TeamPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* Protected */}
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/league/:id" element={<ProtectedRoute><LeaguePage /></ProtectedRoute>} />
        <Route path="/league/:id/auction" element={<ProtectedRoute><AuctionRoomPage /></ProtectedRoute>} />
        <Route path="/league/:id/team/:memberId" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  );
}
