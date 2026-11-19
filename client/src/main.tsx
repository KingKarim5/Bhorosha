import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/noto-serif-bengali/400.css';
import '@fontsource/noto-serif-bengali/600.css';
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/600.css';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import './styles.css';
import { App } from './App';
import { I18nProvider } from './lib/i18n';
import { AuthProvider } from './lib/auth';
import { warmUp } from './lib/api';

warmUp();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
