import React from 'react';
import ReactDOM from 'react-dom/client';
import MaterialsPage from './MaterialsPage';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing materials page root');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MaterialsPage />
  </React.StrictMode>,
);
