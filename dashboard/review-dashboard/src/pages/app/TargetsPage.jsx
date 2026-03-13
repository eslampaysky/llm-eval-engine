import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../App.jsx';

const TARGET_TYPES = ['openai', 'huggingface', 'webhook'];

const EMPTY_FORM = {
  name: '',
  description: '',
  base_url: '',
  model_name: '',
  api_key: '',
  target_type: 'openai',
};

const TYPE_PLACEHOLDERS = {
  openai: { base_url: 'https://api.openai.com', model_name: 'gpt-4o-mini' },
  huggingface: {
    base_url: 'https://api-inference.huggingface.co/models',
    model_name: 'meta-llama/Llama-3-8B-Instruct',
  },
  webhook: { base_url: 'https://your-api.com/chat', model_name: 'custom-model' },
};

function formatDate(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function Spinner({ size = 16 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: '2px solid rgba(255,255,255,0.1)',
        borderTopColor: 'var(--accent, var(--blue))',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        display: 'inline-block',
      }}
    />
  );
}

function EmptyState({ onNew }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
        No targets yet
      </div>
      <div style={{ color: 'var(--muted, var(--mid))', fontSize: 13, marginBottom: 24, maxWidth: 360 }}>
        Register an AI target to track repeat break sessions and compare safety over time.
      </div>
      <button className="btn btn-primary" onClick={onNew}>
        Add your first target
      </button>
    </div>
  );
}

function typeColor(type) {
  const map = {
    openai: 'var(--accent2, var(--green))',
    huggingface: '#ff9f43',
    webhook: 'var(--accent, var(--blue))',
  };
  return map[type] || 'var(--muted, var(--mid))';
}

function TargetCard({ target, onDelete, onClick }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirm(`Delete "${target.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await onDelete(target.target_id);
    setDeleting(false);
  }

  return (
    <div
      onClick={onClick}
      className="card"
      style={{
        cursor: 'pointer',
        position: 'relative',
        transition: 'border-color 0.15s, transform 0.1s',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '20px 22px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--line)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: typeColor(target.target_type),
            background: `${typeColor(target.target_type)}18`,
            border: `1px solid ${typeColor(target.target_type)}40`,
            padding: '2px 8px',
            borderRadius: 4,
          }}
        >
          {target.target_type}
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted, var(--mid))',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 13,
            opacity: deleting ? 0.6 : 1,
          }}
          title="Delete target"
        >
          {deleting ? <Spinner size={12} /> : 'x'}
        </button>
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--hi)', lineHeight: 1.2 }}>
        {target.name}
      </div>

      {target.description && (
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--muted, var(--mid))',
            lineHeight: 1.5,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {target.description}
        </div>
      )}

      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(232,244,255,0.5)' }}>
        {target.model_name || '--'}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 20,
          marginTop: 6,
          paddingTop: 12,
          borderTop: '1px solid rgba(33,57,90,0.5)',
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted, var(--mid))', marginBottom: 2 }}>RUNS</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            {target.run_count ?? 0}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted, var(--mid))', marginBottom: 2 }}>LAST RUN</div>
          <div style={{ fontSize: 12, color: 'var(--text)' }}>
            {formatDate(target.last_run_at)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted, var(--mid))', marginBottom: 2 }}>CREATED</div>
          <div style={{ fontSize: 12, color: 'var(--text)' }}>
            {formatDate(target.created_at)}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewTargetModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showKey, setShowKey] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const ph = TYPE_PLACEHOLDERS[form.target_type] || {};

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.base_url.trim() || !form.model_name.trim()) {
      setError('Name, Base URL, and Model Name are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.createTarget({
        name: form.name.trim(),
        description: form.description.trim(),
        base_url: form.base_url.trim(),
        model_name: form.model_name.trim(),
        api_key: form.api_key.trim(),
        target_type: form.target_type,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(33,57,90,0.9)',
    borderRadius: 7,
    color: 'var(--text)',
    fontSize: 13,
    padding: '9px 12px',
    outline: 'none',
    transition: 'border-color 0.12s',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    fontSize: 11,
    color: 'var(--muted)',
    fontFamily: 'var(--mono)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: 5,
  };

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(2,4,10,0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid rgba(59,180,255,0.25)',
          borderRadius: 14,
          padding: '28px 30px',
          width: '100%',
          maxWidth: 520,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,180,255,0.08)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                color: 'var(--accent, var(--blue))',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              // new target
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(232,244,255,0.95)' }}>
              Register AI Target
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid rgba(33,57,90,0.8)',
              borderRadius: 8,
              color: 'var(--muted, var(--mid))',
              width: 34,
              height: 34,
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Target Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {TARGET_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('target_type', t)}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    borderRadius: 7,
                    fontSize: 12,
                    fontFamily: 'var(--mono)',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                    background: form.target_type === t ? 'rgba(59,180,255,0.12)' : 'rgba(255,255,255,0.03)',
                    border: form.target_type === t ? '1px solid rgba(59,180,255,0.5)' : '1px solid rgba(33,57,90,0.8)',
                    color: form.target_type === t ? 'var(--accent, var(--blue))' : 'var(--muted, var(--mid))',
                    fontWeight: form.target_type === t ? 600 : 400,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Name *</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Customer Support Bot"
              required
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(33,57,90,0.9)'; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 70, lineHeight: 1.5 }}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="What does this AI system do?"
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(33,57,90,0.9)'; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Base URL *</label>
            <input
              style={inputStyle}
              value={form.base_url}
              onChange={(e) => set('base_url', e.target.value)}
              placeholder={ph.base_url || 'https://api.example.com'}
              required
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(33,57,90,0.9)'; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Model Name *</label>
            <input
              style={inputStyle}
              value={form.model_name}
              onChange={(e) => set('model_name', e.target.value)}
              placeholder={ph.model_name || 'model-name'}
              required
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(33,57,90,0.9)'; }}
            />
          </div>

          <div>
            <label style={labelStyle}>API Key (optional)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showKey ? 'text' : 'password'}
                style={{ ...inputStyle, flex: 1 }}
                value={form.api_key}
                onChange={(e) => set('api_key', e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(33,57,90,0.9)'; }}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(33,57,90,0.9)',
                  borderRadius: 7,
              color: 'var(--muted, var(--mid))',
                  padding: '0 14px',
                  cursor: 'pointer',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                }}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--muted, var(--mid))', marginTop: 5 }}>
              Stored encrypted on the server. Never logged or exposed.
            </div>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(255,77,109,0.1)',
                border: '1px solid rgba(255,77,109,0.3)',
                borderRadius: 7,
                padding: '10px 14px',
                color: '#ff4d6d',
                fontSize: 12.5,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 7,
                background: 'none',
                border: '1px solid rgba(33,57,90,0.9)',
                color: 'var(--muted, var(--mid))',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 2,
                padding: '10px',
                borderRadius: 7,
                background: saving ? 'rgba(59,180,255,0.2)' : 'rgba(59,180,255,0.15)',
                border: '1px solid rgba(59,180,255,0.4)',
                color: 'var(--accent, var(--blue))',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {saving ? (
                <>
                  <Spinner size={13} /> Creating...
                </>
              ) : (
                'Create Target'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TargetsPage() {
  const navigate = useNavigate();
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  const fetchTargets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [targetRows, reportRows] = await Promise.all([api.getTargets(), api.getReports()]);
      const reportsByTarget = new Map();
      (reportRows || []).forEach((row) => {
        if (!row.target_id) return;
        const entry = reportsByTarget.get(row.target_id) || { count: 0, lastRunAt: null };
        entry.count += 1;
        if (!entry.lastRunAt || new Date(row.created_at) > new Date(entry.lastRunAt)) {
          entry.lastRunAt = row.created_at;
        }
        reportsByTarget.set(row.target_id, entry);
      });
      const hydrated = (targetRows || []).map((target) => {
        const stats = reportsByTarget.get(target.target_id) || { count: 0, lastRunAt: null };
        return {
          ...target,
          run_count: stats.count,
          last_run_at: stats.lastRunAt,
        };
      });
      setTargets(hydrated);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);

  async function handleDelete(targetId) {
    try {
      await api.deleteTarget(targetId);
      setTargets((ts) => ts.filter((t) => t.target_id !== targetId));
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  function handleCreated() {
    fetchTargets();
  }

  return (
    <div className="page fade-in">
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color: 'var(--accent, var(--blue))',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: 5,
            }}
          >
            // core - targets
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: 'rgba(232,244,255,0.95)',
              margin: 0,
              letterSpacing: '-0.025em',
            }}
          >
            Targets
          </h1>
          <p style={{ color: 'var(--muted, var(--mid))', fontSize: 13, marginTop: 5, marginBottom: 0 }}>
            AI systems registered for adversarial testing.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            background: 'rgba(59,180,255,0.12)',
            border: '1px solid rgba(59,180,255,0.35)',
            color: 'var(--accent, var(--blue))',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.12s',
            whiteSpace: 'nowrap',
            marginTop: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59,180,255,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(59,180,255,0.12)'; }}
        >
          New Target
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Spinner size={28} />
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            background: 'rgba(255,77,109,0.08)',
            border: '1px solid rgba(255,77,109,0.25)',
            borderRadius: 10,
            padding: '16px 20px',
            color: '#ff4d6d',
            marginBottom: 20,
          }}
        >
          <strong>Error loading targets:</strong> {error}
          <button
            onClick={fetchTargets}
            style={{
              marginLeft: 14,
              background: 'none',
              border: '1px solid rgba(255,77,109,0.4)',
              color: '#ff4d6d',
              borderRadius: 5,
              padding: '3px 10px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && targets.length === 0 && (
        <EmptyState onNew={() => setShowModal(true)} />
      )}

      {!loading && !error && targets.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              gap: 16,
              marginBottom: 24,
              padding: '14px 18px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(33,57,90,0.5)',
              borderRadius: 10,
            }}
          >
            <div>
              <span style={{ fontSize: 11, color: 'var(--muted, var(--mid))', marginRight: 8 }}>TOTAL TARGETS</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{targets.length}</span>
            </div>
            <div style={{ width: 1, background: 'rgba(33,57,90,0.8)' }} />
            <div>
              <span style={{ fontSize: 11, color: 'var(--muted, var(--mid))', marginRight: 8 }}>TOTAL RUNS</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                {targets.reduce((s, t) => s + (t.run_count || 0), 0)}
              </span>
            </div>
            <div style={{ width: 1, background: 'rgba(33,57,90,0.8)' }} />
            <div>
              <span style={{ fontSize: 11, color: 'var(--muted, var(--mid))', marginRight: 8 }}>TYPES</span>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>
                {[...new Set(targets.map((t) => t.target_type))].join(', ')}
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16,
            }}
          >
            {targets.map((target) => (
              <TargetCard
                key={target.target_id}
                target={target}
                onDelete={handleDelete}
                onClick={() => navigate(`/app/targets/${target.target_id}`)}
              />
            ))}
          </div>
        </>
      )}

      {showModal && (
        <NewTargetModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
