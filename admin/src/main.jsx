import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { SchoolProvider } from './context/SchoolContext.jsx';
import { UserProvider } from './context/UserContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UserProvider>
      <SchoolProvider>
        <App />
      </SchoolProvider>
    </UserProvider>
  </React.StrictMode>
);
