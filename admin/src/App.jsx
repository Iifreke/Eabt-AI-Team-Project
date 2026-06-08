import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Leads from './pages/Leads.jsx';
import Conversations from './pages/Conversations.jsx';
import Chats from './pages/Chats.jsx';
import Tickets from './pages/Tickets.jsx';
import Shortcuts from './pages/Shortcuts.jsx';
import Monitoring from './pages/Monitoring.jsx';
import KnowledgeBase from './pages/KnowledgeBase.jsx';
import Users from './pages/Users.jsx';
import SetPassword from './pages/SetPassword.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/" element={<Navigate to="/chats" replace />} />

        <Route path="/dashboard" element={<ProtectedRoute superAdminOnly><Dashboard /></ProtectedRoute>} />
        <Route path="/chats" element={<ProtectedRoute><Chats /></ProtectedRoute>} />
        <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
        <Route path="/contacts" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><Conversations /></ProtectedRoute>} />
        <Route path="/shortcuts" element={<ProtectedRoute><Shortcuts /></ProtectedRoute>} />
        <Route path="/monitoring" element={<ProtectedRoute><Monitoring /></ProtectedRoute>} />
        <Route path="/knowledge-base" element={<ProtectedRoute superAdminOnly><KnowledgeBase /></ProtectedRoute>} />
        <Route path="/agents" element={<ProtectedRoute><Users /></ProtectedRoute>} />

        {/* Legacy redirects */}
        <Route path="/leads" element={<Navigate to="/contacts" replace />} />
        <Route path="/conversations" element={<Navigate to="/history" replace />} />
        <Route path="/escalations" element={<Navigate to="/chats" replace />} />
        <Route path="/users" element={<Navigate to="/agents" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
