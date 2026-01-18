import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThreePaneLayout } from './components/layout/ThreePaneLayout';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Integrations from './pages/Integrations';
import Login from './pages/Login';
import Register from './pages/Register';
import { useAuth } from './lib/AuthContext';

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { token, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="h-screen bg-[#0A0A0A] flex items-center justify-center text-gray-500">Loading...</div>;
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      <Route element={
        <ProtectedRoute>
          <ThreePaneLayout />
        </ProtectedRoute>
      }>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chat/:taskId" element={<Dashboard />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/settings" element={<Settings />} />
        
        {/* Redirects/Legacy */}
        <Route path="/tasks/:taskId" element={<Dashboard />} />
        <Route path="/active" element={<Dashboard />} />
        <Route path="/history" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}

export default App;