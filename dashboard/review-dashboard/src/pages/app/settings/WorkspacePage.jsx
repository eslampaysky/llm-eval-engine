/**
 * Workspace settings.
 * Client-side preferences stored in localStorage:
 * - Breaker API key (X-API-KEY)
 * - Provider keys (Groq/OpenAI/Gemini) (future wiring)
 * - Backend URL override (stored only)
 * - Notification preferences (shared with existing App.jsx config)
 */
import { useMemo, useState } from 'react';
import { getApiKey, ls, setApiKey } from '../../../App.jsx';

const S = {
  card: {
    background: '#0c1220',
    border: '1px solid rgba(33,57,90,0.7)',
    borderRadius: 12,
    padding: '22px 24px',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 800,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'rgba(232,244,255,0.9)',
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: 'rgba(142,168,199,0.65)',
    marginBottom: 18,
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    marginBottom: 5,
    fontSize: 10.5,
    color: 'rgba(142,168,199,0.7)',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  input: {
    flex: 1,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(33,57,90,0.9)',
    borderRadius: 8,
    color: 'rgba(232,244,255,0.93)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    padding: '10px 13px',
    outline: 'none',
    transition: 'border-color 0.12s, box-shadow 0.12s',
    minWidth: 0,
  },
};

function EyeInput({ storageKey, placeholder, label, hint, onSave }) {
  const [val, setVal] = useState(() => ls.get(storageKey, ''));
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  function save() {
    ls.set(storageKey, val);
    if (onSave) onSave(val);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={S.label}>{label}</label>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type={show ? 'text' : 'password'}
          style={S.input}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={placeholder}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--accent)';
            e.target.style.boxShadow = 'var(--accent-glow)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'rgba(33,57,90,0.9)';
            e.target.style.boxShadow = 'none';
          }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(33,57,90,0.9)',
            borderRadius: 8,
            color: 'rgba(142,168,199,0.6)',
            padding: '0 12px',
            cursor: 'pointer',
            fontSize: 12,
            flexShrink: 0,
          }}
          aria-label={show ? 'Hide value' : 'Show value'}
        >
          {show ? 'hide' : 'show'}
        </button>
        <button
          type="button"
          onClick={save}
          style={{
            padding: '0 14px',
            borderRadius: 8,
            background: saved ? 'rgba(38,240,185,0.12)' : 'rgba(59,180,255,0.10)',
            border: `1px solid ${saved ? 'rgba(38,240,185,0.32)' : 'rgba(59,180,255,0.25)'}`,
            color: saved ? 'var(--accent2)' : 'var(--accent)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.15s',
          }}
        >
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: 'rgba(142,168,199,0.45)', marginTop: 5, lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, label, desc, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        padding: '12px 12px',
        borderRadius: 10,
        border: '1px solid rgba(33,57,90,0.65)',
        background: 'rgba(255,255,255,0.02)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: 'rgba(232,244,255,0.86)' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'rgba(142,168,199,0.55)', marginTop: 2, lineHeight: 1.35 }}>{desc}</div>
      </div>
      <div
        style={{
          width: 42,
          height: 22,
          borderRadius: 999,
          background: on ? 'rgba(59,180,255,0.22)' : 'rgba(255,255,255,0.06)',
          border: on ? '1px solid rgba(59,180,255,0.35)' : '1px solid rgba(33,57,90,0.75)',
          position: 'relative',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 22 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: on ? 'var(--accent)' : 'rgba(142,168,199,0.5)',
            transition: 'all 0.15s',
          }}
        />
      </div>
    </button>
  );
}

export default function WorkspacePage() {
  const [apiKey, setApiKeyState] = useState(() => getApiKey());
  const [apiBase, setApiBase] = useState(() => ls.get('abl_api_base', ''));
  const [apiBaseSaved, setApiBaseSaved] = useState(false);

  const notifCfg = useMemo(
    () =>
      ls.get('abl_notif_cfg', {
        slack_enabled: false,
        slack_url: '',
        email_enabled: false,
        email_addr: '',
        when: 'always',
      }),
    [],
  );
  const [notifEnabled, setNotifEnabled] = useState(!!notifCfg.slack_enabled);
  const [emailNotif, setEmailNotif] = useState(!!notifCfg.email_enabled);

  function writeNotif(next) {
    ls.set('abl_notif_cfg', next);
  }

  function saveApiBase() {
    ls.set('abl_api_base', apiBase);
    setApiBaseSaved(true);
    setTimeout(() => setApiBaseSaved(false), 2000);
  }

  return (
    <div>
      <div style={S.card}>
        <div style={S.sectionTitle}>Breaker API Key</div>
        <div style={S.sectionDesc}>Used for X-API-KEY authenticated endpoints (targets, runs, usage).</div>

        <EyeInput
          storageKey="abl_api_key"
          label="X-API-KEY"
          placeholder="client_key"
          hint="Stored locally. Used for API requests from this browser."
          onSave={(value) => {
            setApiKey(value);
            setApiKeyState(value);
            try {
              localStorage.setItem('llm_eval_api_key', value);
            } catch {}
          }}
        />

        <div style={{ fontSize: 11, color: 'rgba(142,168,199,0.45)' }}>
          Active key: <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>{apiKey || '--'}</code>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.sectionTitle}>Provider Keys</div>
        <div style={S.sectionDesc}>Optional keys for external providers. Stored locally.</div>

        <EyeInput storageKey="abl_groq_api_key" label="Groq API Key" placeholder="gsk_..." />
        <EyeInput storageKey="abl_openai_api_key" label="OpenAI API Key" placeholder="sk-..." />
        <EyeInput storageKey="abl_gemini_api_key" label="Gemini API Key" placeholder="AIza..." />
      </div>

      <div style={S.card}>
        <div style={S.sectionTitle}>Backend URL Override</div>
        <div style={S.sectionDesc}>
          Stored locally. If you wire consumers to read it, you can switch between local and prod without rebuilding.
        </div>

        <label style={S.label}>API Base URL</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            style={{ ...S.input, fontFamily: "'Space Grotesk', sans-serif" }}
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="http://localhost:8000"
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--accent)';
              e.target.style.boxShadow = 'var(--accent-glow)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(33,57,90,0.9)';
              e.target.style.boxShadow = 'none';
            }}
          />
          <button
            type="button"
            onClick={saveApiBase}
            style={{
              padding: '0 16px',
              borderRadius: 8,
              background: apiBaseSaved ? 'rgba(38,240,185,0.12)' : 'rgba(59,180,255,0.10)',
              border: `1px solid ${apiBaseSaved ? 'rgba(38,240,185,0.32)' : 'rgba(59,180,255,0.25)'}`,
              color: apiBaseSaved ? 'var(--accent2)' : 'var(--accent)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {apiBaseSaved ? 'Saved' : 'Save'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(142,168,199,0.45)', marginTop: 6 }}>
          Default: <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>{import.meta.env.VITE_API_BASE_URL || 'VITE_API_BASE_URL'}</code>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.sectionTitle}>Notifications</div>
        <div style={S.sectionDesc}>Local preferences mirrored into the existing `abl_notif_cfg` config.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Toggle
            on={notifEnabled}
            label="Slack alerts"
            desc="Post run completion summaries to Slack."
            onChange={(v) => {
              setNotifEnabled(v);
              const next = { ...ls.get('abl_notif_cfg', {}), slack_enabled: v };
              writeNotif(next);
            }}
          />
          <Toggle
            on={emailNotif}
            label="Email notifications"
            desc="Receive a summary email after each completed run."
            onChange={(v) => {
              setEmailNotif(v);
              const next = { ...ls.get('abl_notif_cfg', {}), email_enabled: v };
              writeNotif(next);
            }}
          />
        </div>

        {notifEnabled && (
          <div style={{ marginTop: 14 }}>
            <EyeInput
              storageKey="abl_notif_slack_url"
              label="Slack Webhook URL"
              placeholder="https://hooks.slack.com/services/..."
              hint="Stored locally. Existing notification sender will read `abl_notif_cfg.slack_url`, so we also mirror there on save."
              onSave={(value) => {
                const next = { ...ls.get('abl_notif_cfg', {}), slack_url: value };
                writeNotif(next);
              }}
            />
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.sectionTitle}>Data</div>
        <div style={S.sectionDesc}>Clear locally stored keys and preferences in this browser.</div>

        <button
          type="button"
          onClick={() => {
            if (!confirm('Clear all locally stored keys and preferences?')) return;
            const keys = [
              'abl_api_key',
              'llm_eval_api_key',
              'abl_groq_api_key',
              'abl_openai_api_key',
              'abl_gemini_api_key',
              'abl_api_base',
              'abl_notif_cfg',
              'abl_notif_slack_url',
              'abl_autosave',
            ];
            keys.forEach((k) => {
              try {
                localStorage.removeItem(k);
              } catch {}
            });
            window.location.reload();
          }}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            background: 'rgba(255,77,109,0.06)',
            border: '1px solid rgba(255,77,109,0.2)',
            color: '#ff4d6d',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Clear Local Data
        </button>
      </div>
    </div>
  );
}

