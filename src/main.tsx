import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './render/fonts';
import './styles.css';
import { App } from './ui/App';
import { useEditor } from './state/store';

// Ganchos para testes automatizados (apenas em desenvolvimento).
if (import.meta.env.DEV) (window as unknown as { __editor: typeof useEditor }).__editor = useEditor;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
