import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import PasswordStrength, { getPasswordCriteria } from '../components/PasswordStrength.jsx';

export default function SetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session) {
        setReady(true);
        setLinkError('');
      } else if (event === 'SIGNED_OUT') {
        setLinkError('This link is invalid or has expired. Please request a new invite or password reset.');
        setReady(true);
      } else if (event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED') {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        setReady(true);
        setLinkError('');
      } else {
        const hash = window.location.hash;
        if (hash.includes('error=')) {
          const params = new URLSearchParams(hash.substring(1));
          const errorDesc = params.get('error_description') || 'The invite link is invalid or has expired.';
          setLinkError(errorDesc.replace(/\+/g, ' '));
          setReady(true);
        } else if (!hash) {
          setLinkError('No token found in the URL. Please click the exact link from your email.');
          setReady(true);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const allMet = getPasswordCriteria(password).every(c => c.met);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allMet) {
      setError('Please ensure your password meets all the security requirements.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }
    setDone(true);
    setTimeout(() => navigate('/chats'), 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="text-3xl mb-2">🎓</div>
          <h1 className="text-xl font-bold text-gray-900">Set Your Password</h1>
          <p className="text-sm text-gray-500 mt-1">Create a password to access the admin dashboard</p>
        </div>

        {done ? (
          <div className="text-center py-4">
            <div className="text-green-600 font-semibold text-sm">Password set! Redirecting…</div>
          </div>
        ) : !ready ? (
          <div className="flex items-center justify-center gap-2 text-gray-400 py-6">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Verifying your invite link…</span>
          </div>
        ) : linkError ? (
          <div className="space-y-4 text-center">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 text-left">
              {linkError}
            </div>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Go to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Enter new password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              
              <PasswordStrength password={password} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="Repeat your password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Setting password…' : 'Set Password & Continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
