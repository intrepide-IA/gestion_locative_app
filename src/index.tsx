import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initDatabaseIfEmpty } from './utils/initDb';
import { demarrerPlanificateur } from './services/notificationScheduler';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Impossible de trouver l’élément root');
}

const root = createRoot(container);

initDatabaseIfEmpty().then(() => {
  root.render(<App />);
  demarrerPlanificateur();
});