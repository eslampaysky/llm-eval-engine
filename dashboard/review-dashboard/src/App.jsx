import { useEffect, useMemo, useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/dashboard';
import HomePage from './pages/home';
import EvaluatePage from './pages/evaluate';
import ReviewPage from './pages/review';
import ReportsPage from './pages/reports';
import HistoryPage from './pages/history';
import SettingsPage from './pages/settings';
import LabLoader from './components/LabLoader';
import { api } from './services/api';

function normalizeError(err) {
  return err?.message || 'Request failed';
}

export default function App() {
  const [page, setPage] = useState('home');
  const [providers, setProviders] = useState([]);
  const [latestEvaluation, setLatestEvaluation] = useState(null);

  const [reports, setReports] = useState([]);
  const [history, setHistory] = useState([]);
  const [usage, setUsage] = useState(null);
  const [reviewRules, setReviewRules] = useState(null);

  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const [reportsError, setReportsError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [usageError, setUsageError] = useState('');
  const [networkPending, setNetworkPending] = useState(0);

  const currentApiKey = useMemo(() => api.getApiKey(), []);

  useEffect(() => {
    api.getProviders()
      .then((res) => setProviders(res.providers || []))
      .catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    if (page === 'reports') {
      setLoadingReports(true);
      setReportsError('');
      api.getReports()
        .then((res) => setReports(res.reports || []))
        .catch((err) => setReportsError(normalizeError(err)))
        .finally(() => setLoadingReports(false));
    }

    if (page === 'history') {
      setLoadingHistory(true);
      setHistoryError('');
      api.getHistory()
        .then((res) => setHistory(res.history || []))
        .catch((err) => setHistoryError(normalizeError(err)))
        .finally(() => setLoadingHistory(false));
    }

    if (page === 'review') {
      api.getReviewRules()
        .then((res) => setReviewRules(res.rules || null))
        .catch(() => setReviewRules(null));
    }

    if (page === 'settings' || page === 'dashboard') {
      setLoadingUsage(true);
      setUsageError('');
      api.getUsageSummary()
        .then((res) => setUsage(res.usage || null))
        .catch((err) => setUsageError(normalizeError(err)))
        .finally(() => setLoadingUsage(false));
    }
  }, [page]);

  useEffect(() => {
    const handler = (event) => {
      setNetworkPending(Number(event?.detail?.pending || 0));
    };
    window.addEventListener('abl:network', handler);
    return () => window.removeEventListener('abl:network', handler);
  }, []);

  const onEvaluate = async (payload) => {
    const data = await api.evaluate(payload);
    setPage('dashboard');
    setLatestEvaluation(data);
    return data;
  };

  const onRunDemo = async (payload) => {
    const data = await api.evaluate(payload);
    setLatestEvaluation(data);
    return data;
  };

  const onSaveApiKey = (key) => {
    api.setApiKey(key);
    window.location.reload();
  };

  const onSubmitReview = async (reportId, body) => {
    const data = await api.submitHumanReview(reportId, body);
    if (data?.retrained_rules) {
      setReviewRules(data.retrained_rules);
    }
    return data;
  };

  const onReviewCompleted = () => {
    setLatestEvaluation(null);
    setPage('evaluate');
  };

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} />

      <main className="content-shell">
        {page === 'home' ? (
          <HomePage
            latestEvaluation={latestEvaluation}
            onRunDemo={onRunDemo}
            setPage={setPage}
          />
        ) : null}
        {page === 'dashboard' ? <DashboardPage latestEvaluation={latestEvaluation} /> : null}
        {page === 'evaluate' ? (
          <EvaluatePage
            providers={providers}
            latestEvaluation={latestEvaluation}
            setLatestEvaluation={setLatestEvaluation}
            onEvaluate={onEvaluate}
          />
        ) : null}
        {page === 'review' ? (
          <ReviewPage
            latestEvaluation={latestEvaluation}
            onSubmitReview={onSubmitReview}
            reviewRules={reviewRules}
            onReviewCompleted={onReviewCompleted}
          />
        ) : null}
        {page === 'reports' ? (
          <ReportsPage
            reports={reports}
            loading={loadingReports}
            error={reportsError}
            apiBaseUrl={api.baseUrl}
          />
        ) : null}
        {page === 'history' ? (
          <HistoryPage
            history={history}
            loading={loadingHistory}
            error={historyError}
          />
        ) : null}
        {page === 'settings' ? (
          <SettingsPage
            usage={usage}
            loading={loadingUsage}
            error={usageError}
            currentApiKey={currentApiKey}
            onSaveApiKey={onSaveApiKey}
          />
        ) : null}
      </main>

      {networkPending > 0 ? (
        <div className="network-loader-wrap">
          <LabLoader text="AI Breaker Lab analyzing..." />
        </div>
      ) : null}
    </div>
  );
}
