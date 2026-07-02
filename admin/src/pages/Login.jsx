import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState({ loading: false, sent: false, error: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    } else {
      navigate('/dashboard');
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotStatus({ loading: true, sent: false, error: '' });
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    if (resetErr) {
      setForgotStatus({ loading: false, sent: false, error: resetErr.message });
    } else {
      setForgotStatus({ loading: false, sent: true, error: '' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="text-3xl mb-2">🎓</div>
          <h1 className="text-xl font-bold text-gray-900">School Bot Admin</h1>
          <p className="text-sm text-gray-500 mt-1">
            {forgotMode ? 'Reset your password' : 'Sign in to your dashboard'}
          </p>
        </div>

        {forgotMode ? (
          forgotStatus.sent ? (
            <div className="space-y-4 text-center">
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 text-left">
                If an account exists for <strong>{forgotEmail}</strong>, a password reset link has been sent. Check your inbox.
              </div>
              <button
                onClick={() => { setForgotMode(false); setForgotStatus({ loading: false, sent: false, error: '' }); }}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="admin@school.edu.ng"
                />
              </div>

              {forgotStatus.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                  {forgotStatus.error}
                </div>
              )}

              <button
                type="submit"
                disabled={forgotStatus.loading}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {forgotStatus.loading ? 'Sending…' : 'Send Reset Link'}
              </button>

              <button
                type="button"
                onClick={() => setForgotMode(false)}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
              >
                Back to Sign In
              </button>
            </form>
          )
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="admin@school.edu.ng"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setForgotEmail(email); }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            {/* ── Invite-only sign-up ── */}
            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center mb-3">
                Have an invite link from a Super Admin?
              </p>
              <button
                type="button"
                onClick={() => navigate('/set-password')}
                className="w-full border border-blue-200 text-blue-600 rounded-lg py-2.5 text-sm font-medium hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                Sign up with invite link
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">
                Only invited team members can create an account.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
