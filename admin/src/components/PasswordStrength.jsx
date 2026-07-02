import React from 'react';

export function getPasswordCriteria(password) {
  return [
    { id: 'length', label: 'Minimum 8 characters', met: password.length >= 8 },
    { id: 'uppercase', label: 'At least one capital letter', met: /[A-Z]/.test(password) },
    { id: 'lowercase', label: 'At least one lowercase letter', met: /[a-z]/.test(password) },
    { id: 'number', label: 'At least one number', met: /[0-9]/.test(password) },
    { id: 'special', label: 'At least one special character', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export default function PasswordStrength({ password }) {
  const criteria = getPasswordCriteria(password);
  const metCount = criteria.filter(c => c.met).length;

  const strengthText = metCount === 0 ? 'Empty' : metCount <= 2 ? 'Weak' : metCount <= 4 ? 'Medium' : 'Strong';
  const strengthColor = metCount === 0 ? 'bg-gray-200' : metCount <= 2 ? 'bg-red-500' : metCount <= 4 ? 'bg-amber-500' : 'bg-green-500';
  const strengthPercent = (metCount / criteria.length) * 100;

  return (
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
  );
}
