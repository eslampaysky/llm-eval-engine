import { useState } from 'react';
import { apiFetch } from '../../App.jsx';

const MODEL_PRESETS = [
  {
    id: 'gpt4o',
    label: 'GPT-4o / OpenAI-compat',
    base_url: 'https://api.openai.com',
    model_name: 'gpt-4o-mini',
    adapter_type: 'openai',
  },
  {
    id: 'gemini',
    label: 'Gemini 2.0 Flash',
    base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model_name: 'gemini-2.0-flash',
    adapter_type: 'openai',
  },
  {
    id: 'claude',
    label: 'Claude Sonnet',
    base_url: 'https://api.anthropic.com/v1',
    model_name: 'claude-3-5-sonnet-20241022',
    adapter_type: 'openai-compatible proxy',
  },
];

const DEFAULT_PROMPT = 'Describe what you see in this image.';

function humanFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const thresh = 1024;
  if (Math.abs(bytes) < thresh) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let u = -1;
  let b = bytes;
  do {
    b /= thresh;
    ++u;
  } while (Math.abs(b) >= thresh && u < units.length - 1);
  return `${b.toFixed(1)} ${units[u]}`;
}

export default function VisionPage() {
  const [fileState, setFileState] = useState({
    image_b64: null,
    mime_type: null,
    file_name: '',
    size: 0,
  });
  const [dragOver, setDragOver] = useState(false);

  const [selectedPreset, setSelectedPreset] = useState('gpt4o');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com');
  const [modelName, setModelName] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [criteria, setCriteria] = useState({
    ocr: true,
    spatial: true,
    objects: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportId, setReportId] = useState(null);
  const [ocrScore, setOcrScore] = useState(null);
  const [spatialScore, setSpatialScore] = useState(null);

  function handlePresetChange(id) {
    setSelectedPreset(id);
    const preset = MODEL_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setBaseUrl(preset.base_url);
    setModelName(preset.model_name);
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || '';
        const idx = typeof result === 'string' ? result.indexOf(',') : -1;
        const base64 = idx !== -1 ? result.slice(idx + 1) : result;
        resolve(String(base64));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelected(file) {
    if (!file) return;
    const mime = file.type || (file.name && file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
    if (!['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'].includes(mime)) {
      setError('Unsupported file type. Please upload PNG, JPG, or PDF.');
      return;
    }
    setError('');
    try {
      const b64 = await readFileAsBase64(file);
      setFileState({
        image_b64: b64,
        mime_type: mime,
        file_name: file.name,
        size: file.size,
      });
    } catch (err) {
      setError('Failed to read file. Please try again.');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelected(file);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function handleFileInputChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelected(file);
    }
  }

  async function handleRun(e) {
    e.preventDefault();
    if (loading) return;

    if (!fileState.image_b64 || !fileState.mime_type) {
      setError('Upload an image or PDF before running evaluation.');
      return;
    }
    if (!baseUrl.trim() || !modelName.trim()) {
      setError('Base URL and model name are required.');
      return;
    }

    setError('');
    setLoading(true);
    setReportId(null);
    setOcrScore(null);
    setSpatialScore(null);

    const inputType = fileState.mime_type === 'application/pdf' ? 'pdf' : 'image';

    const target = {
      type: 'openai',
      base_url: baseUrl.trim(),
      api_key: apiKey.trim(),
      model_name: modelName.trim(),
    };

    const validationHints = [];
    if (criteria.ocr) validationHints.push('ocr_accuracy');
    if (criteria.spatial) validationHints.push('spatial_reasoning');
    if (criteria.objects) validationHints.push('object_detection');

    const description = `${prompt.trim() || DEFAULT_PROMPT}\n\nValidation focus: ${validationHints.join(', ') || 'none'}.`;

    const body = {
      target,
      description,
      num_tests: 1,
      groq_api_key: '',
      judges: [],
      input_type: inputType,
      image_b64: fileState.image_b64,
      mime_type: fileState.mime_type,
    };

    try {
      const resp = await apiFetch('/break', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setReportId(resp?.report_id || null);
      // Scores are computed in the main evaluation pipeline; this page focuses on dispatching the run.
    } catch (err) {
      setError(err?.message || 'Vision evaluation failed.');
    } finally {
      setLoading(false);
    }
  }

  const isImage = fileState.mime_type && fileState.mime_type.startsWith('image/');

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// testing · vision</div>
        <div className="page-title">Vision / Multimodal Evaluation</div>
        <div className="page-desc">
          Upload an image or PDF and send it to your multimodal models with consistent validation criteria.
        </div>
      </div>

      {error && <div className="err-box">⚠ {error}</div>}

      <div className="page-grid-2">
        {/* Left column — config */}
        <form onSubmit={handleRun} className="card" style={{ alignSelf: 'flex-start' }}>
          <div className="card-label">Input & model config</div>

          {/* 1. File drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            style={{
              border: '1px dashed var(--line2)',
              borderRadius: 12,
              padding: 16,
              textAlign: 'center',
              background: dragOver ? 'rgba(91,155,245,0.08)' : 'var(--bg1)',
              marginBottom: 12,
              cursor: 'pointer',
            }}
            onClick={() => {
              const input = document.getElementById('vision-file-input');
              if (input) input.click();
            }}
          >
            <input
              id="vision-file-input"
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
            <div style={{ fontSize: 13, color: 'var(--hi)', marginBottom: 4 }}>
              Drop a PNG, JPG, or PDF here
            </div>
            <div style={{ fontSize: 11, color: 'var(--mid)' }}>
              or click to select a file
            </div>
            {fileState.file_name && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--mid)' }}>
                Selected: <span style={{ color: 'var(--hi)' }}>{fileState.file_name}</span>
                {fileState.size ? ` · ${humanFileSize(fileState.size)}` : ''}
              </div>
            )}
          </div>

          {/* 2. Model selector */}
          <div className="field">
            <label className="label">Vision model preset</label>
            <select
              className="select"
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
            >
              {MODEL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* 3–4. Base URL, model, API key */}
          <div className="input-row" style={{ gridTemplateColumns: '1.4fr 1.1fr' }}>
            <div>
              <label className="label">Base URL</label>
              <input
                className="input"
                placeholder="https://api.openai.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Model name</label>
              <input
                className="input"
                placeholder="gpt-4o-mini"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label className="label">API key</label>
            <input
              className="input"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          {/* 5. Test prompt */}
          <div className="field">
            <label className="label">Test prompt</label>
            <textarea
              className="textarea"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {/* 6. Validation criteria */}
          <div className="field">
            <label className="label">Validation criteria</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mid)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={criteria.ocr}
                  onChange={(e) => setCriteria((prev) => ({ ...prev, ocr: e.target.checked }))}
                />
                OCR accuracy
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={criteria.spatial}
                  onChange={(e) => setCriteria((prev) => ({ ...prev, spatial: e.target.checked }))}
                />
                Spatial reasoning
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={criteria.objects}
                  onChange={(e) => setCriteria((prev) => ({ ...prev, objects: e.target.checked }))}
                />
                Object detection
              </label>
            </div>
          </div>

          {/* 7. Run button */}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Running…' : 'Run vision eval'}
          </button>

          {reportId && (
            <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mid)' }}>
              Report ID: {reportId}
            </div>
          )}
        </form>

        {/* Right column — preview & KPIs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 1. Preview card */}
          <div className="card">
            <div className="card-label">Preview</div>
            {!fileState.image_b64 ? (
              <div style={{ fontSize: 13, color: 'var(--mid)' }}>Upload a file to see a preview here.</div>
            ) : (
              <div>
                {isImage ? (
                  <img
                    src={`data:${fileState.mime_type};base64,${fileState.image_b64}`}
                    alt={fileState.file_name || 'Uploaded image'}
                    style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, border: '1px solid var(--line2)' }}
                  />
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--mid)' }}>
                    <div style={{ marginBottom: 4 }}>PDF uploaded:</div>
                    <div style={{ color: 'var(--hi)' }}>{fileState.file_name}</div>
                    {fileState.size ? (
                      <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>
                        {humanFileSize(fileState.size)}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. KPI cards */}
          <div className="kpi-row">
            <div className="kpi">
              <div className="kpi-label">OCR score</div>
              <div className="kpi-value">{ocrScore != null ? ocrScore.toFixed(1) : '—'}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Spatial score</div>
              <div className="kpi-value">{spatialScore != null ? spatialScore.toFixed(1) : '—'}</div>
            </div>
          </div>

          {/* 3. Supported models info */}
          <div className="card">
            <div className="card-label">Supported presets</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, color: 'var(--mid)' }}>
              {MODEL_PRESETS.map((p) => (
                <li key={p.id} style={{ padding: '4px 0' }}>
                  <span style={{ color: 'var(--hi)' }}>{p.label}</span>
                  <span style={{ marginLeft: 6 }}>·</span>
                  <span style={{ marginLeft: 6 }}>{p.adapter_type}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

