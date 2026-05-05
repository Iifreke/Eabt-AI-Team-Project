import React from 'react';
import ReactDOM from 'react-dom/client';
import ChatWidget from './ChatWidget.jsx';

const config = window.SchoolBotConfig;

if (!config || !config.schoolId || !config.apiUrl) {
  console.warn('[SchoolBot] Missing SchoolBotConfig. Widget not loaded.');
} else {
  const container = document.createElement('div');
  container.id = 'school-bot-root';
  document.body.appendChild(container);
  ReactDOM.createRoot(container).render(<ChatWidget config={config} />);
}
