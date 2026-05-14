import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { SchoolProvider } from './context/SchoolContext.jsx';
import { UserProvider } from './context/UserContext.jsx';
import { EscalationProvider } from './context/EscalationContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UserProvider>
      <EscalationProvider>
        <SchoolProvider>
          <App />
        </SchoolProvider>
      </EscalationProvider>
    </UserProvider>
  </React.StrictMode>
);
