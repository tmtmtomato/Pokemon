import React from 'react';
import ReactDOM from 'react-dom/client';
import { LangProvider } from '../app/lib/LangContext';
import TrackerApp from './TrackerApp';
import '../app/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <TrackerApp />
    </LangProvider>
  </React.StrictMode>,
);
