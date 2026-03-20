import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import CopyButton from '../../components/CopyButton.jsx';
import AuditStatusBadge from '../../components/AuditStatusBadge.jsx';

const STATUS_MAP = {
  pending: 'degraded',
  ready: 'healthy',
  regression: 'critical',
  ok: 'healthy',
  failed: 'critical',
};

export default function MonitoringPage() {
  const { t } = useTranslation();
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [featureName, setFeatureName] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState('daily');
  const [alertWebhook, setAlertWebhook] = useState('');
  const [testInputs, setTestInputs] = useState('');
  const [target, setTarget] = useState({
    type: 'webhook',
    endpoint_url: '',
    headers: '',
    base_url: '',
    model_name: '',
  });

  async function loadMonitors() {
    setLoading(true);
    setError('');
    try {
      const data = await api.getMonitors();
      setMonitors(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || t('monitoring.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMonitors();
  }, []);

  async function createMonitor() {
    if (!featureName.trim() || !description.trim()) return;
    const inputs = testInputs.split('\n').map((line) => line.trim()).filter(Boolean);
    if (inputs.length < 3) {
      setError(t('monitoring.errors.provideInputs'));
      return;
    }

    let headers = null;
    if (target.headers.trim()) {
      try {
        headers = JSON.parse(target.headers);
      } catch {
        setError(t('monitoring.errors.invalidHeaders'));
        return;
      }
    }

    setCreating(true);
    setActionMsg('');
    setError('');
    try {
      await api.createMonitor({
        feature_name: featureName.trim(),
        description: description.trim(),
        target: {
          type: target.type,
          endpoint_url: target.endpoint_url || undefined,
          headers: headers || undefined,
          base_url: target.base_url || undefined,
          model_name: target.model_name || undefined,
        },
        test_inputs: inputs,
        schedule,
        alert_webhook: alertWebhook.trim() || null,
      });
      setActionMsg(t('monitoring.messages.created'));
      setShowModal(false);
      await loadMonitors();
    } catch (err) {
      setError(err.message || t('monitoring.errors.createFailed'));
    } finally {
      setCreating(false);
      setTimeout(() => setActionMsg(''), 2000);
    }
  }

  async function runCheck(monitorId) {
    setActionMsg('');
    setError('');
    try {
      await api.runMonitorCheck(monitorId);
      setActionMsg(t('monitoring.messages.started'));
    } catch (err) {
      setError(err.message || t('monitoring.errors.runFailed'));
    } finally {
      setTimeout(() => setActionMsg(''), 2000);
    }
  }

  const canCreate = useMemo(() => {
    if (!featureName.trim() || !description.trim() || creating) return false;
    if (target.type === 'openai') return Boolean(target.base_url.trim() && target.model_name.trim());
    if (target.type === 'webhook') return Boolean(target.endpoint_url.trim());
    return false;
  }, [creating, description, featureName, target]);

  if (loading) {
    return (
      <div className="page-container fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="page-eyebrow">{t('monitoring.eyebrow')}</div>
          <h1 className="page-title">{t('monitoring.title')}</h1>
          <p className="page-subtitle">{t('monitoring.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> {t('monitoring.create')}
        </button>
      </div>

      {error && <div className="card" style={{ padding: '12px 16px', marginBottom: 16, background: 'rgba(232, 89, 60, 0.08)', border: '1px solid rgba(232, 89, 60, 0.3)', color: 'var(--coral)', fontSize: 13, borderRadius: 'var(--radius-md)' }}>{error}</div>}
      {actionMsg && <div className="card" style={{ padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--green)' }}>{actionMsg}</div>}

      {monitors.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>M</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            {t('monitoring.empty.title')}
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {t('monitoring.empty.subtitle')}
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> {t('monitoring.create')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {monitors.map((monitor) => {
            let baseline = null;
            if (monitor.baseline_json) {
              try {
                baseline = JSON.parse(monitor.baseline_json);
              } catch {}
            }
            const changedSamples = Array.isArray(monitor.changed_samples) ? monitor.changed_samples : [];
            const statusKey = monitor.last_status || 'pending';

            return (
              <div key={monitor.monitor_id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>
                    {monitor.feature_name}
                  </div>
                  <AuditStatusBadge status={STATUS_MAP[statusKey] || 'degraded'} label={t(`monitoring.status.${statusKey}`, statusKey)} />
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{monitor.description}</p>

                {baseline && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                    {t('monitoring.baseline', { capturedAt: baseline.captured_at || '-', count: baseline.samples?.length || 0 })}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="btn btn-ghost" onClick={() => runCheck(monitor.monitor_id)} style={{ fontSize: 12 }}>
                    {t('monitoring.runCheck')}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    ID: {monitor.monitor_id}
                  </span>
                </div>

                {changedSamples.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                    {changedSamples.map((sample, index) => (
                      <div key={index} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{sample.change}</div>
                        {sample.fix && <CopyButton text={sample.fix} label={t('monitoring.copyRegressionFix')} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('monitoring.form.title')}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label className="form-label">{t('monitoring.form.featureName')}</label>
                <input className="form-input" placeholder={t('monitoring.form.featureNamePlaceholder')} value={featureName} onChange={(e) => setFeatureName(e.target.value)} />
              </div>
              <div>
                <label className="form-label">{t('monitoring.form.description')}</label>
                <textarea className="form-textarea" rows={3} placeholder={t('monitoring.form.descriptionPlaceholder')} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">{t('monitoring.form.schedule')}</label>
                  <select className="form-select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                    <option value="daily">{t('monitoring.form.scheduleOptions.daily')}</option>
                    <option value="hourly">{t('monitoring.form.scheduleOptions.hourly')}</option>
                    <option value="on_deploy">{t('monitoring.form.scheduleOptions.onDeploy')}</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">{t('monitoring.form.alertWebhook')}</label>
                  <input className="form-input" placeholder="https://hooks.slack.com/..." value={alertWebhook} onChange={(e) => setAlertWebhook(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">{t('monitoring.form.targetType')}</label>
                <select className="form-select" value={target.type} onChange={(e) => setTarget((previous) => ({ ...previous, type: e.target.value }))}>
                  <option value="webhook">{t('monitoring.form.targetOptions.webhook')}</option>
                  <option value="openai">{t('monitoring.form.targetOptions.openai')}</option>
                  <option value="huggingface">{t('monitoring.form.targetOptions.huggingface')}</option>
                  <option value="langchain">{t('monitoring.form.targetOptions.langchain')}</option>
                </select>
              </div>
              {target.type === 'webhook' && (
                <>
                  <div>
                    <label className="form-label">{t('monitoring.form.endpointUrl')}</label>
                    <input className="form-input" placeholder="https://your-api.com/feature" value={target.endpoint_url} onChange={(e) => setTarget((previous) => ({ ...previous, endpoint_url: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">{t('monitoring.form.headers')}</label>
                    <textarea className="form-textarea" rows={2} placeholder='{"Authorization": "Bearer ..."}' value={target.headers} onChange={(e) => setTarget((previous) => ({ ...previous, headers: e.target.value }))} />
                  </div>
                </>
              )}
              {target.type === 'openai' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">{t('monitoring.form.baseUrl')}</label>
                    <input className="form-input" placeholder="https://api.openai.com/v1" value={target.base_url} onChange={(e) => setTarget((previous) => ({ ...previous, base_url: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">{t('monitoring.form.model')}</label>
                    <input className="form-input" placeholder="gpt-4o-mini" value={target.model_name} onChange={(e) => setTarget((previous) => ({ ...previous, model_name: e.target.value }))} />
                  </div>
                </div>
              )}
              <div>
                <label className="form-label">{t('monitoring.form.testInputs')}</label>
                <textarea className="form-textarea" rows={4} placeholder={t('monitoring.form.testInputsPlaceholder')} value={testInputs} onChange={(e) => setTestInputs(e.target.value)} />
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={createMonitor} disabled={!canCreate}>
              {creating ? t('monitoring.form.creating') : t('monitoring.form.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
