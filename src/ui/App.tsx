import { useEffect, useState } from 'react';
import { ProjectsScreen } from './ProjectsScreen';
import { Editor } from './Editor';
import { Toast } from './Toast';
import { DialogHost } from './dialogs';
import { TooltipLayer } from './Tooltip';
import { health } from '../platform/api';

/** Roteamento mínimo por hash: #/ = projetos, #/p/<id> = editor. */
function useRoute() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const m = /^#\/p\/([\w-]+)/.exec(hash);
  return m ? { name: 'editor' as const, id: m[1]! } : { name: 'projects' as const };
}

export function App() {
  const route = useRoute();
  const [serverIssue, setServerIssue] = useState<string | null>(null);

  useEffect(() => {
    health()
      .then((h) => setServerIssue(h.error))
      .catch((e: unknown) => setServerIssue(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <>
      {serverIssue && <div className="banner-error">{serverIssue}</div>}
      {route.name === 'editor' ? <Editor key={route.id} projectId={route.id} /> : <ProjectsScreen />}
      <Toast />
      <DialogHost />
      <TooltipLayer />
    </>
  );
}
