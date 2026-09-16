import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { prepareErpNetworkSession } from './lib/erpServiceWorker.js';
import './styles.css';

async function bootstrap() {
  const canStart = await prepareErpNetworkSession();
  if (!canStart) return;

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
