import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function SetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session) {
        setReady(true);
      } else if (event === 'SIGNED_OUT') {
        setError('This invite link is invalid or has expired. Please ask a Super Admin to resend the invite.');
        setReady(true);
      } else if (event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED') {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        setReady(true);
      } else if (!window.location.hash) {
        setError('No invite token found in the URL. Please click the exact link from your email.');
        setReady(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const criteria = [
    { id: 'length', label: 'Minimum 8 characters', met: password.length >= 8 },
    { id: 'uppercase', label: 'At least one capital letter', met: /[A-Z]/.test(password) },
    { id: 'lowercase', label: 'At least one lowercase letter', met: /[a-z]/.test(password) },
    { id: 'number', label: 'At least one number', met: /[0-9]/.test(password) },
    { id: 'special', label: 'At least one special character', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const allMet = criteria.every(c => c.met);
  const metCount = criteria.filter(c => c.met).length;
  
  const strengthText = metCount === 0 ? 'Empty' : metCount <= 2 ? 'Weak' : metCount <= 4 ? 'Medium' : 'Strong';
  const strengthColor = metCount === 0 ? 'bg-gray-200' : metCount <= 2 ? 'bg-red-500' : metCount <= 4 ? 'bg-amber-500' : 'bg-green-500';
  const strengthPercent = (metCount / criteria.length) * 100;

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
    setTimeout(() => navigate('/dashboard'), 1500);
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
              
              {/* Strength Meter and Criteria Checklist */}
              <div className="mt-3 space-y-3">
                {password && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Password Strength:</span>
                      <span className={`font-semibold ${
                        metCount <= 2 ? 'text-red-500' : metCount <= 4 ? 'text-amber-500' : 'text-green-500'
                      }`}>
                        {strengthText}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${strengthColor}`} 
                        style={{ width: `${strengthPercent}%` }}
                      />
                    </div>
                  </div>
                )}
                
                <ul className="space-y-1.5">
                  {criteria.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-xs">
                      <span className={`flex items-center justify-center w-4 h-4 rounded-full border transition-colors ${
                        c.met 
                          ? 'bg-green-50 border-green-200 text-green-600' 
                          : password 
                            ? 'bg-red-50 border-red-100 text-red-400' 
                            : 'bg-gray-50 border-gray-200 text-gray-400'
                      }`}>
                        {c.met ? (
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="w-1 h-1 rounded-full bg-current" />
                        )}
                      </span>
                      <span className={`transition-colors ${
                        c.met 
                          ? 'text-green-600' 
                          : password 
                            ? 'text-red-400' 
                            : 'text-gray-400'
                      }`}>
                        {c.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
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
