import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout/Layout';
import IndividualDashboard from './pages/IndividualDashboard';
import TeamDashboard from './pages/TeamDashboard';
import Projects from './pages/Projects';
import Clients from './pages/Clients';
import WeeklyMeeting from './pages/WeeklyMeeting';
import TeamManagement from './pages/TeamManagement';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function BDMRoute({ children }) {
  const { user } = useAuth();
  return user?.role === 'bdm' ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<IndividualDashboard />} />
            <Route path="team" element={<BDMRoute><TeamDashboard /></BDMRoute>} />
            <Route path="projects" element={<Projects />} />
            <Route path="clients" element={<Clients />} />
            <Route path="meeting" element={<WeeklyMeeting />} />
            <Route path="team-management" element={<BDMRoute><TeamManagement /></BDMRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
