import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getApiKey, ls, pollActive, pollStart, pollSub, setApiKey } from '../App.jsx';

const AppShellContext = createContext(null);

export function AppShellProvider({ children }) {
  const [report, setReport] = useState(null);
  const [demoReport, setDemoReport] = useState(null);
  const [compareFocus, setCompareFocus] = useState(null);
  const [persona, setPersona] = useState('dev');
  const [apiKey, setApiKeyState] = useState(getApiKey());
  const [groqApiKey, setGroqApiKeyState] = useState(() => ls.get('abl_groq_api_key') || '');
  const [running, setRunning] = useState(pollActive());

  useEffect(() => {
    let mounted = true;

    async function reattachIfStillProcessing() {
      const savedId = ls.get('abl_active_run_id');
      const savedDemoId = ls.get('abl_demo_active_run_id');
      if (pollActive()) return;

      if (savedDemoId) {
        try {
          const nextReport = await api.getDemoReport(savedDemoId);
          if (!mounted) return;
          if (nextReport.status === 'processing') {
            setRunning(true);
            pollStart(savedDemoId, nextReport.sample_count || 5, api.getDemoReport, 'demo');
            return;
          }
        } catch {}
        ls.set('abl_demo_active_run_id', null);
      }

      if (savedId) {
        try {
          const nextReport = await api.getReport(savedId);
          if (!mounted) return;
          if (nextReport.status === 'processing') {
            setRunning(true);
            pollStart(savedId, nextReport.sample_count || 20, api.getReport, 'break');
            return;
          }
        } catch {}
        ls.set('abl_active_run_id', null);
      }

      if (mounted) setRunning(false);
    }

    reattachIfStillProcessing();
    const unsub = pollSub((ev) => {
      if (ev.type === 'done') {
        setRunning(false);
        if (ev.mode === 'demo') setDemoReport(ev.report);
        else {
          setReport(ev.report);
          setCompareFocus(ev.report);
        }
        ls.set(ev.mode === 'demo' ? 'abl_demo_active_run_id' : 'abl_active_run_id', null);
      }
      if (ev.type === 'failed' || ev.type === 'timeout' || ev.type === 'canceled') {
        setRunning(false);
        ls.set(ev.mode === 'demo' ? 'abl_demo_active_run_id' : 'abl_active_run_id', null);
      }
      if (ev.type === 'tick') setRunning(true);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  function updateApiKey(value) {
    setApiKey(value);
    setApiKeyState(value);
  }

  function updateGroqApiKey(value) {
    ls.set('abl_groq_api_key', value);
    setGroqApiKeyState(value);
  }

  const value = useMemo(() => ({
    report,
    setReport,
    demoReport,
    setDemoReport,
    compareFocus,
    setCompareFocus,
    persona,
    setPersona,
    apiKey,
    setApiKey: updateApiKey,
    groqApiKey,
    setGroqApiKey: updateGroqApiKey,
    running,
  }), [report, demoReport, compareFocus, persona, apiKey, groqApiKey, running]);

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const value = useContext(AppShellContext);
  if (!value) throw new Error('useAppShell must be used within AppShellProvider');
  return value;
}
