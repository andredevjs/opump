import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { WalletProvider } from './components/providers/WalletProvider';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WalletProvider>
        <App />
      </WalletProvider>
    </ErrorBoundary>
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#12121a',
          color: '#e4e4ed',
          border: '1px solid #2a2a3d',
          fontSize: '14px',
        },
        success: {
          iconTheme: { primary: '#22c55e', secondary: '#12121a' },
        },
        error: {
          iconTheme: { primary: '#ef4444', secondary: '#12121a' },
        },
      }}
    />
  </React.StrictMode>,
);
