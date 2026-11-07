import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App.jsx';
import { LanguageProvider } from './ui/Language.jsx';
import './ui/characters.css';
import './ui/common.css';
import './ui/pixel.css';
import './ui/observation.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);
