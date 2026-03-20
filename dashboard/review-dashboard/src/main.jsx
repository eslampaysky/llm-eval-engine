import './design-system.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RootApp from './RootApp.jsx';
import './i18n/index.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
