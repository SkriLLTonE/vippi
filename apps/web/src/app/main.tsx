import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AppProviders } from './entrypoint/app-providers';
import { router } from './router/router';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing in index.html');

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
