import React from 'react';
import ReactDOM from 'react-dom/client';
import { getModulePath } from './lib/constants';
import { hasSupabaseConfig } from './lib/supabase';
import { getFirstAccessibleModule, signIn } from './lib/auth';
import { Login } from './pages/Login';
import './styles.css';

async function handleAccess(credentials) {
  const users = hasSupabaseConfig ? [] : await loadLocalUsers();
  const user = await signIn(credentials, users);
  const nextModule = getFirstAccessibleModule(user);
  window.location.replace(nextModule ? getModulePath(nextModule) : '/dashboard');
}

async function loadLocalUsers() {
  const { dataStore } = await import('./lib/dataStore');
  return dataStore.list('app_users') || [];
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Login onAccess={handleAccess} />
  </React.StrictMode>
);
