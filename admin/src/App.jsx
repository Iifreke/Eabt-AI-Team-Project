import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Leads from './pages/Leads.jsx';
import Conversations from './pages/Conversations.jsx';
import Escalations from './pages/Escalations.jsx';
import KnowledgeBase from './pages/KnowledgeBase.jsx';
import Users from './pages/Users.jsx';
import SetPassword from './pages/SetPassword.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />
        <Route path="/leads" element={
          <ProtectedRoute><Leads /></ProtectedRoute>
        } />
        <Route path="/conversations" element={
          <ProtectedRoute><Conversations /></ProtectedRoute>
        } />
        <Route path="/escalations" element={
          <ProtectedRoute><Escalations /></ProtectedRoute>
        } />
        <Route path="/knowledge-base" element={
          <ProtectedRoute><KnowledgeBase /></ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute><Users /></ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
