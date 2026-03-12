import { useState } from 'react';

const PRESETS = {
  openai: {
    label: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    placeholder: 'sk-...',
  },
  anthropic: {
    label: 'Anthropic',
    base_url: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-4-5-20251001',
    placeholder: 'sk-ant-...',
  },
  gemini: {
    label: 'Gemini',
    base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-1.5-pro',
    placeholder: 'AIza...',
  },
  groq: {
    label: 'Groq',
    base_url: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    placeholder: 'gsk_...',
  },
  mistral: {
    label: 'Mistral',
    base_url: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    placeholder: 'your-key',
  },
  ollama: {
    label: 'Ollama (local)',
    base_url: 'http://localhost:11434/v1',
    model: 'llama3',
    placeholder: 'ollama',
  },
  custom: {
    label: 'Custom',
    base_url: '',
    model: '',
    placeholder: 'your-key',
  },
};

const ROLE_INFO = {
  arbiter: {
    label: 'Arbiter',
    color: 'var(--accent)',
    desc: 'Used only when Groq scores land in the uncertain middle.',
    icon: 'A',
  },
  safety: {
    label: 'Safety judge',
    color: '#3dbcf6',
    desc: 'Used only for safety, refusal, jailbreak, and toxicity tests.',
    icon: 'S',
  },
  custom: {
    label: 'Extra judge',
    color: 'var(--green)',
    desc: 'Runs on every test so you can compare results in the report.',
    icon: '+',
  },
};

function emptyJudge(role = 'arbiter') {
  const provider = role === 'safety' ? 'anthropic' : 'openai';
  const preset = PRESETS[provider];
  return {
    id: Math.random().toString(36).slice(2),
    provider,
    name: role === 'arbiter' ? 'openai-arbiter' : role === 'safety' ? 'claude-safety' : 'custom-judge',
    base_url: preset.base_url,
    model: preset.model,
    api_key: '',
    role,
  };
}

function PwInput({ value, onChange, placeholder, disabled }) {
  const [show, setShow] = useState(false);

  return (
    <div className="pw-field">
      <input
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow(v => !v)}
        tabIndex={-1}
        disabled={disabled}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

function JudgeCard({ judge, index, onChange, onRemove, disabled }) {
  const roleInfo = ROLE_INFO[judge.role] || ROLE_INFO.custom;
  const preset = PRESETS[judge.provider] || PRESETS.custom;

  function set(key, value) {
    onChange(index, { ...judge, [key]: value });
  }

  function changeProvider(provider) {
    const nextPreset = PRESETS[provider] || PRESETS.custom;
    onChange(index, {
      ...judge,
      provider,
      base_url: nextPreset.base_url,
      model: nextPreset.model,
      api_key: '',
    });
  }

  return (
    <div
      style={{
        border: `1px solid ${roleInfo.color}33`,
        borderRadius: 'var(--r2)',
        background: 'rgba(255,255,255,.02)',
        padding: '14px 16px',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            fontWeight: 600,
            color: roleInfo.color,
            border: `1px solid ${roleInfo.color}55`,
            borderRadius: 4,
            padding: '2px 7px',
          }}
        >
          {roleInfo.icon} {roleInfo.label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--mute)', flex: 1 }}>{roleInfo.desc}</span>
        <button
          type="button"
          onClick={() => onRemove(index)}
          disabled={disabled}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--mute)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 4px',
          }}
        >
          x
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Provider</label>
          <select className="select" value={judge.provider} onChange={e => changeProvider(e.target.value)} disabled={disabled}>
            {Object.entries(PRESETS).map(([key, item]) => (
              <option key={key} value={key}>{item.label}</option>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Role</label>
          <select className="select" value={judge.role} onChange={e => set('role', e.target.value)} disabled={disabled}>
            <option value="arbiter">Arbiter - uncertain scores only</option>
            <option value="safety">Safety judge - safety tests only</option>
            <option value="custom">Extra - runs on every test</option>
          </select>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Model</label>
          <input
            className="input"
            value={judge.model}
            onChange={e => set('model', e.target.value)}
            placeholder={preset.model}
            disabled={disabled}
          />
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Judge name</label>
          <input
            className="input"
            value={judge.name}
            onChange={e => set('name', e.target.value)}
            placeholder="my-judge"
            disabled={disabled}
          />
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Base URL</label>
          <input
            className="input"
            value={judge.base_url}
            onChange={e => set('base_url', e.target.value)}
            placeholder={preset.base_url || 'https://api.example.com/v1'}
            disabled={disabled}
          />
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">API key</label>
          <PwInput
            value={judge.api_key}
            onChange={e => set('api_key', e.target.value)}
            placeholder={preset.placeholder}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

export default function JudgeConfigPanel({ judges, onChange, groqKeySupplied, disabled }) {
  function addJudge(role) {
    onChange([...judges, emptyJudge(role)]);
  }

  function updateJudge(index, updated) {
    const next = [...judges];
    next[index] = updated;
    onChange(next);
  }

  function removeJudge(index) {
    onChange(judges.filter((_, i) => i !== index));
  }

  const hasArbiter = judges.some(judge => judge.role === 'arbiter');
  const hasSafety = judges.some(judge => judge.role === 'safety');

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="card-label" style={{ marginBottom: 4 }}>03 - Judge configuration</div>
          <div style={{ fontSize: 11.5, color: 'var(--mid)' }}>
            Groq is always the primary judge. Add judges below to activate tiered routing.
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '10px 14px',
          borderRadius: 'var(--r)',
          border: '1px solid var(--line2)',
          background: 'rgba(255,255,255,.02)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: 'var(--hi)', fontWeight: 600 }}>
            Groq - llama-3.3-70b-versatile
          </div>
          <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>
            Scores every test first. Only uncertain results escalate.
          </div>
        </div>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: groqKeySupplied ? 'var(--accent2)' : 'var(--accent)',
          }}
        >
          {groqKeySupplied ? 'key supplied' : 'env fallback'}
        </div>
      </div>

      {judges.length === 0 && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r)',
            border: '1px dashed var(--line2)',
            marginBottom: 12,
            fontSize: 11.5,
            color: 'var(--mute)',
            lineHeight: 1.6,
          }}
        >
          Add an arbiter for uncertain rows, a safety judge for refusal and jailbreak rows, or extra judges for side-by-side comparison.
        </div>
      )}

      {judges.map((judge, index) => (
        <JudgeCard
          key={judge.id}
          judge={judge}
          index={index}
          onChange={updateJudge}
          onRemove={removeJudge}
          disabled={disabled}
        />
      ))}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => addJudge('arbiter')}
          disabled={disabled || hasArbiter}
          style={{ fontSize: 11.5, opacity: hasArbiter ? 0.4 : 1 }}
          title={hasArbiter ? 'Only one arbiter allowed' : 'Add arbiter'}
        >
          Add arbiter
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => addJudge('safety')}
          disabled={disabled || hasSafety}
          style={{ fontSize: 11.5, opacity: hasSafety ? 0.4 : 1 }}
          title={hasSafety ? 'Only one safety judge allowed' : 'Add safety judge'}
        >
          Add safety judge
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => addJudge('custom')}
          disabled={disabled}
          style={{ fontSize: 11.5 }}
        >
          Add extra judge
        </button>
      </div>
    </div>
  );
}
