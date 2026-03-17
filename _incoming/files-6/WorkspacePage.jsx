/**
 * src/pages/app/settings/WorkspacePage.jsx
 * ==========================================
 * Workspace controls:
 *  - Breaker API key (X-API-KEY) management
 *  - LLM provider key management (Groq, OpenAI, Gemini)
 *  - Backend URL override
 *  - Notification webhook
 *  - Data & export
 *
 * All stored in localStorage (these are client-side preferences, not user account data).
 */

import { useState } from 'react';

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

const ls = {
  get: (k, fallback = '') => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── Shared style tokens ──────────────────────────────────────────────────────

const S = {
  card: {
    background: '#0c1220',
    border: '1px solid rgba(33,57,90,0.7)',
    borderRadius: 12, padding: '22px 24px', marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'rgba(232,244,255,0.9)', marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12, color: 'rgba(142,168,199,0.65)', marginBottom: 18, lineHeight: 1.5,
  },
  label: {
    display: 'block', marginBottom: 5,
    fontSize: 10.5, color: 'rgba(142,168,199,0.7)',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em', textTransform: 'uppercase',
  },
  input: {
    flex: 1, background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(33,57,90,0.9)',
    borderRadius: 8, color: 'rgba(232,244,255,0.93)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12, padding: '10px 13px', outline: 'none',
    transition: 'border-color 0.12s', minWidth: 0,
  },
  divider: { height: 1, background: 'rgba(33,57,90,0.5)', margin: '18px 0' },
};

function EyeInput({ storageKey, placeholder, label, hint }) {
  const [val,  setVal]  = useState(() => ls.get(storageKey, ''));
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  function save() {
    ls.set(storageKey, val);
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
          onChange={e => setVal(e.target.value)}
          placeholder={placeholder}
          onFocus={e => e.target.style.borderColor = 'var(--neon-blue, #3bb4ff)'}
          onBlur={e => e.target.style.borderColor = 'rgba(33,57,90,0.9)'}
          onKeyDown={e => e.key === 'Enter' && save()}
        />
        <button
          type="button" onClick={() => setShow(s => !s)}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(33,57,90,0.9)',
            borderRadius: 8, color: 'rgba(142,168,199,0.6)',
            padding: '0 12px', cursor: 'pointer', fontSize: 14, flexShrink: 0,
          }}
        >
          {show ? '🙈' : '👁'}
        </button>
        <button
          type="button" onClick={save}
          style={{
            padding: '0 14px', borderRadius: 8,
            background: saved ? 'rgba(38,240,185,0.1)' : 'rgba(59,180,255,0.08)',
            border: `1px solid ${saved ? 'rgba(38,240,185,0.3)' : 'rgba(59,180,255,0.25)'}`,
            color: saved ? '#26f0b9' : 'var(--neon-blue, #3bb4ff)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            flexShrink: 0, transition: 'all 0.15s',
          }}
        >
          {saved ? '✓' : 'Save'}
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

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ on, onChange, label, desc }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start',
      justifyContent: 'space-between', gap: 16, padding: '12px 0',
      borderBottom: '1px solid rgba(33,57,90,0.4)',
    }}>
      <div>
        <div style={{ fontSize: 13, color: 'rgba(232,244,255,0.85)', fontWeight: 500, marginBottom: 2 }}>{label}</div>
        {desc && <div style={{ fontSize: 11.5, color: 'rgba(142,168,199,0.55)', lineHeight: 1.5 }}>{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!on)}
        style={{
          width: 40, height: 22, flexShrink: 0,
          borderRadius: 11, border: 'none', cursor: 'pointer',
          position: 'relative', transition: 'background 0.2s',
          background: on ? 'rgba(59,180,255,0.5)' : 'rgba(33,57,90,0.9)',
        }}
      >
        <div style={{
          position: 'absolute', top: 3,
          left: on ? 21 : 3,
          width: 16, height: 16, borderRadius: 8,
          background: on ? 'var(--neon-blue, #3bb4ff)' : 'rgba(142,168,199,0.5)',
          transition: 'left 0.2s, background 0.2s',
          boxShadow: on ? '0 0 6px rgba(59,180,255,0.5)' : 'none',
        }} />
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [notifEnabled, setNotifEnabled] = useState(() => ls.get('abl_notif_enabled', false));
  const [emailNotif,   setEmailNotif]   = useState(() => ls.get('abl_notif_email', false));
  const [autoSave,     setAutoSave]     = useState(() => ls.get('abl_autosave', true));

  function saveToggle(key, val) {
    ls.set(key, val);
  }

  // API base URL
  const [apiBase, setApiBase] = useState(() => ls.get('abl_api_base', '') || import.meta.env.VITE_API_BASE_URL || '');
  const [apiBaseSaved, setApiBaseSaved] = useState(false);

  function saveApiBase() {
    ls.set('abl_api_base', apiBase);
    setApiBaseSaved(true);
    setTimeout(() => setApiBaseSaved(false), 2000);
  }

  return (
    <div>

      {/* ── API Keys ─────────────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.sectionTitle}>API Keys</div>
        <div style={S.sectionDesc}>
          Keys are stored locally in your browser and sent directly to each provider.
          They are never stored on the AI Breaker server.
        </div>

        <EyeInput
          storageKey="abl_api_key"
          label="AI Breaker API Key (X-API-KEY)"
          placeholder="client_key"
          hint="Required for all authenticated API calls."
        />

        <div style={S.divider} />

        <div style={{ marginBottom: 10, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'rgba(142,168,199,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          LLM Provider Keys
        </div>

        <EyeInput
          storageKey="abl_groq_key"
          label="Groq API Key"
          placeholder="gsk_..."
          hint="Used for test generation and judging. Get yours at console.groq.com"
        />
        <EyeInput
          storageKey="abl_openai_key"
          label="OpenAI API Key"
          placeholder="sk-..."
          hint="Used when targeting OpenAI models."
        />
        <EyeInput
          storageKey="abl_gemini_key"
          label="Gemini API Key"
          placeholder="AIza..."
          hint="Used for the Live Demo and Gemini targets."
        />
      </div>

      {/* ── Backend URL ───────────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Backend URL</div>
        <div style={S.sectionDesc}>
          Override the default API endpoint. Useful for local development or
          self-hosted deployments.
        </div>
        <div>
          <label style={S.label}>API Base URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...S.input, fontFamily: "'Space Grotesk', sans-serif", fontSize: 13 }}
              value={apiBase}
              onChange={e => setApiBase(e.target.value)}
              placeholder="https://ai-breaker-labs.vercel.app"
              onFocus={e => e.target.style.borderColor = 'var(--neon-blue, #3bb4ff)'}
              onBlur={e => e.target.style.borderColor = 'rgba(33,57,90,0.9)'}
            />
            <button
              type="button" onClick={saveApiBase}
              style={{
                padding: '0 16px', borderRadius: 8,
                background: apiBaseSaved ? 'rgba(38,240,185,0.1)' : 'rgba(59,180,255,0.08)',
                border: `1px solid ${apiBaseSaved ? 'rgba(38,240,185,0.3)' : 'rgba(59,180,255,0.25)'}`,
                color: apiBaseSaved ? '#26f0b9' : 'var(--neon-blue, #3bb4ff)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                flexShrink: 0, transition: 'all 0.15s',
              }}
            >
              {apiBaseSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(142,168,199,0.45)', marginTop: 6 }}>
            Default: <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {import.meta.env.VITE_API_BASE_URL || 'set via VITE_API_BASE_URL'}
            </code>
          </div>
        </div>
      </div>

      {/* ── Notifications ─────────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Notifications</div>
        <div style={S.sectionDesc}>
          Control when and how you receive alerts about break run results.
        </div>

        <Toggle
          on={notifEnabled} label="Run completion alerts"
          desc="Notify when a break run finishes or fails."
          onChange={v => { setNotifEnabled(v); saveToggle('abl_notif_enabled', v); }}
        />
        <Toggle
          on={emailNotif} label="Email notifications"
          desc="Receive a summary email after each completed run."
          onChange={v => { setEmailNotif(v); saveToggle('abl_notif_email', v); }}
        />

        {notifEnabled && (
          <div style={{ marginTop: 14 }}>
            <EyeInput
              storageKey="abl_slack_webhook"
              label="Slack Webhook URL"
              placeholder="https://hooks.slack.com/services/..."
              hint="Post results to a Slack channel automatically."
            />
          </div>
        )}
      </div>

      {/* ── Preferences ───────────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Preferences</div>
        <div style={S.sectionDesc}>General workspace behavior settings.</div>

        <Toggle
          on={autoSave} label="Auto-save form state"
          desc="Remember your last-used model config between sessions."
          onChange={v => { setAutoSave(v); saveToggle('abl_autosave', v); }}
        />
      </div>

      {/* ── Data & Export ─────────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Data & Export</div>
        <div style={S.sectionDesc}>
          Export your run history or clear local workspace data.
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => alert('Export: connect to GET /reports and download JSON.')}
            style={{
              padding: '8px 16px', borderRadius: 8,
              background: 'rgba(59,180,255,0.07)',
              border: '1px solid rgba(59,180,255,0.2)',
              color: 'var(--neon-blue, #3bb4ff)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Export Run History (JSON)
          </button>
          <button
            onClick={() => {
              if (confirm('Clear all locally stored keys and preferences?')) {
                ['abl_api_key','abl_groq_key','abl_openai_key','abl_gemini_key',
                 'abl_api_base','abl_notif_enabled','abl_notif_email',
                 'abl_slack_webhook','abl_autosave'].forEach(k => localStorage.removeItem(k));
                window.location.reload();
              }
            }}
            style={{
              padding: '8px 16px', borderRadius: 8,
              background: 'rgba(255,77,109,0.06)',
              border: '1px solid rgba(255,77,109,0.2)',
              color: '#ff4d6d',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Clear Local Data
          </button>
        </div>
      </div>
    </div>
  );
}
