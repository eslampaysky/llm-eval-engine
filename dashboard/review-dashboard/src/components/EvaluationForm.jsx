import { useMemo, useState } from 'react';

const EMPTY_ROW = { question: '', ground_truth: '', model_answer: '', context: '' };

export default function EvaluationForm({ providers = [], onRun, loading }) {
  const [judgeModel, setJudgeModel] = useState('');
  const [datasetId, setDatasetId] = useState('dataset_v1');
  const [modelVersion, setModelVersion] = useState('model_v1');
  const [row, setRow] = useState(EMPTY_ROW);
  const [datasetText, setDatasetText] = useState('');
  const [error, setError] = useState('');

  const providerOptions = useMemo(() => ['all', ...providers], [providers]);

  const submit = async () => {
    if (loading) return;
    try {
      setError('');
      let dataset = [];

      if (datasetText.trim()) {
        const parsed = JSON.parse(datasetText);
        if (!Array.isArray(parsed)) {
          throw new Error('Dataset JSON must be an array.');
        }
        dataset = parsed;
      } else {
        if (!row.question || !row.ground_truth || !row.model_answer) {
          throw new Error('Question, ground truth, and model answer are required.');
        }
        dataset = [{ ...row }];
      }

      await onRun({
        dataset,
        dataset_id: datasetId || null,
        model_version: modelVersion || null,
        judge_model: judgeModel && judgeModel !== 'all' ? judgeModel : null,
      });
    } catch (err) {
      setError(err.message || 'Failed to submit evaluation.');
    }
  };

  return (
    <div className="panel">
      <h3 className="panel-title">Run Evaluation</h3>
      {loading ? <p className="lock-banner">Lab is running evaluation. Form is locked until it finishes.</p> : null}

      <fieldset className="form-lock" disabled={loading}>
        <div className="field-grid">
          <label>
            <span>Model Provider</span>
            <select value={judgeModel} onChange={(e) => setJudgeModel(e.target.value)}>
              {providerOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-grid two">
          <label>
            <span>Dataset ID</span>
            <input value={datasetId} onChange={(e) => setDatasetId(e.target.value)} placeholder="dataset_v1" />
          </label>
          <label>
            <span>Model Version</span>
            <input value={modelVersion} onChange={(e) => setModelVersion(e.target.value)} placeholder="model_v1" />
          </label>
        </div>

        <div className="field-grid two">
          <label>
            <span>Question</span>
            <textarea value={row.question} onChange={(e) => setRow((s) => ({ ...s, question: e.target.value }))} />
          </label>
          <label>
            <span>Ground Truth</span>
            <textarea value={row.ground_truth} onChange={(e) => setRow((s) => ({ ...s, ground_truth: e.target.value }))} />
          </label>
        </div>

        <div className="field-grid two">
          <label>
            <span>Model Answer</span>
            <textarea value={row.model_answer} onChange={(e) => setRow((s) => ({ ...s, model_answer: e.target.value }))} />
          </label>
          <label>
            <span>Context (optional, RAG)</span>
            <textarea value={row.context} onChange={(e) => setRow((s) => ({ ...s, context: e.target.value }))} />
          </label>
        </div>

        <label>
          <span>Or upload/paste dataset JSON</span>
          <textarea
            className="json-input"
            value={datasetText}
            onChange={(e) => setDatasetText(e.target.value)}
            placeholder='[{"question":"...","ground_truth":"...","model_answer":"..."}]'
          />
        </label>
      </fieldset>

      {error ? <p className="error-text">{error}</p> : null}

      <button className="primary-btn" type="button" onClick={submit} disabled={loading}>
        {loading ? 'Running In Lab...' : 'Run Evaluation'}
      </button>
    </div>
  );
}
