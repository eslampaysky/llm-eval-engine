import { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { api as legacyApi, getApiKey, ls, pollActive, pollStart, pollSub, setApiKey } from '../App.jsx';
import { api } from '../services/api';

const AppShellContext = createContext(null);
const ACTIVE_AUDIT_KEY = 'abl_active_audit';

function readSavedAudit() {
  try {
    const raw = localStorage.getItem(ACTIVE_AUDIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.auditId ? parsed : null;
  } catch {
    return null;
  }
}

export function AppShellProvider({ children }) {
  const [report, setReport] = useState(null);
  const [demoReport, setDemoReport] = useState(null);
  const [compareFocus, setCompareFocus] = useState(null);
  const [persona, setPersona] = useState('dev');
  const [apiKey, setApiKeyState] = useState(getApiKey());
  const [groqApiKey, setGroqApiKeyState] = useState(() => ls.get('abl_groq_api_key') || '');
  const [running, setRunning] = useState(pollActive());

  // ── Agentic QA global polling (survives tab switches) ──────────────────
  const [activeAudit, setActiveAudit] = useState(null);
  const [auditComplete, setAuditComplete] = useState(null);
  const auditPollRef = useRef(null);

  const clearAuditPollingTimer = useCallback(() => {
    if (auditPollRef.current) {
      clearTimeout(auditPollRef.current);
      auditPollRef.current = null;
    }
  }, []);

  const clearAuditComplete = useCallback(() => {
    setAuditComplete(null);
  }, []);

  const clearActiveAudit = useCallback(() => {
    clearAuditPollingTimer();
    localStorage.removeItem(ACTIVE_AUDIT_KEY);
    setActiveAudit(null);
  }, [clearAuditPollingTimer]);

  // Start polling for an active agentic QA audit
  const startAuditPolling = useCallback((auditInfo) => {
    clearAuditPollingTimer();

    localStorage.setItem(ACTIVE_AUDIT_KEY, JSON.stringify(auditInfo));
    setAuditComplete(null);
    setActiveAudit(auditInfo);
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const data = await api.getAgenticQAStatus(auditInfo.auditId);
        if (cancelled) return;

        setActiveAudit((prev) => ({
          ...(prev || auditInfo),
          ...auditInfo,
          status: data.status,
          score: data.score,
          summary: data.summary,
        }));

        if (data.status === 'done') {
          localStorage.removeItem(ACTIVE_AUDIT_KEY);
          clearAuditPollingTimer();
          setActiveAudit(null);
          setAuditComplete(data);
          return;
        }

        if (data.status === 'failed') {
          localStorage.removeItem(ACTIVE_AUDIT_KEY);
          clearAuditPollingTimer();
          setActiveAudit(null);
          return;
        }

        // Still processing — continue polling
        if (!cancelled) {
          auditPollRef.current = setTimeout(poll, 3000);
        }
      } catch {
        // Network error — retry
        if (!cancelled) {
          auditPollRef.current = setTimeout(poll, 5000);
        }
      }
    }

    poll();

    return () => {
      cancelled = true;
      clearAuditPollingTimer();
    };
  }, [clearAuditPollingTimer]);

  const beginAudit = useCallback((auditInfo) => {
    startAuditPolling(auditInfo);
  }, [startAuditPolling]);

  // On mount, check localStorage for an active audit and resume polling
  useEffect(() => {
    const auditInfo = readSavedAudit();
    if (!auditInfo) {
      localStorage.removeItem(ACTIVE_AUDIT_KEY);
      return;
    }
    const cleanup = startAuditPolling(auditInfo);
    return cleanup;
  }, [startAuditPolling]);

  // Watch for new audits being saved to localStorage (from VibeCheckPage)
  useEffect(() => {
    function onStorage(e) {
      if (e.key === ACTIVE_AUDIT_KEY && e.newValue) {
        try {
          const auditInfo = JSON.parse(e.newValue);
          if (auditInfo?.auditId) {
            startAuditPolling(auditInfo);
          }
        } catch {}
      }

      if (e.key === ACTIVE_AUDIT_KEY && !e.newValue) {
        clearAuditPollingTimer();
        setActiveAudit(null);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [clearAuditPollingTimer, startAuditPolling]);

  // ── Legacy LLM eval polling ────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function reattachIfStillProcessing() {
      const savedId = ls.get('abl_active_run_id');
      const savedDemoId = ls.get('abl_demo_active_run_id');
      if (pollActive()) return;

      if (savedDemoId) {
        try {
          const nextReport = await legacyApi.getDemoReport(savedDemoId);
          if (!mounted) return;
          if (nextReport.status === 'processing') {
            setRunning(true);
            pollStart(savedDemoId, nextReport.sample_count || 5, legacyApi.getDemoReport, 'demo');
            return;
          }
        } catch {}
        ls.set('abl_demo_active_run_id', null);
      }

      if (savedId) {
        try {
          const nextReport = await legacyApi.getReport(savedId);
          if (!mounted) return;
          if (nextReport.status === 'processing') {
            setRunning(true);
            pollStart(savedId, nextReport.sample_count || 20, legacyApi.getReport, 'break');
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
    // Agentic QA audit state
    activeAudit,
    beginAudit,
    clearActiveAudit,
    auditComplete,
    clearAuditComplete,
    hasActiveAudit: Boolean(activeAudit),
  }), [report, demoReport, compareFocus, persona, apiKey, groqApiKey, running, activeAudit, beginAudit, clearActiveAudit, auditComplete, clearAuditComplete]);

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    return null; // graceful fallback instead of crashing
  }
  return ctx;
}
