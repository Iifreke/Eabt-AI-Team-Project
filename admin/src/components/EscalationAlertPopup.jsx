import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscalation } from '../context/EscalationContext.jsx';

export default function EscalationAlertPopup() {
  const navigate = useNavigate();
  const { pendingCount, alerting, dismissAlert } = useEscalation();

  if (!alerting || pendingCount === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-80 bg-white rounded-2xl shadow-2xl border-2 border-red-400 overflow-hidden">
      <div className="bg-red-500 px-4 py-2.5 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
        </span>
        <span className="text-white text-sm font-bold">Visitor needs help</span>
      </div>
      <div className="p-4">
        <p className="text-sm text-gray-700 mb-3">
          {pendingCount} chat{pendingCount > 1 ? 's are' : ' is'} waiting for a human agent.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => { dismissAlert(); navigate('/chats'); }}
            className="flex-1 bg-red-500 text-white text-sm font-semibold rounded-lg py-2 hover:bg-red-600 transition-colors"
          >
            View Chats
          </button>
          <button
            onClick={dismissAlert}
            className="px-3 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
