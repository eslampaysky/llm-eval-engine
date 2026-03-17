export default function DocsPage() {
  const codeStyle = {
    margin: 0,
    overflow: 'auto',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r)',
    background: 'var(--bg2)',
    padding: 12,
    color: 'var(--hi)',
    fontFamily: 'var(--mono)',
    fontSize: 12,
    lineHeight: 1.55,
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    overflow: 'hidden',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r)',
    background: 'var(--bg2)',
  };

  const thStyle = {
    textAlign: 'left',
    fontSize: 11,
    color: 'var(--mid)',
    padding: '10px 12px',
    borderBottom: '1px solid var(--line)',
    fontFamily: 'var(--mono)',
    letterSpacing: '.06em',
    textTransform: 'uppercase',
  };

  const tdStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid var(--line)',
    color: 'var(--mid)',
    fontSize: 13,
    verticalAlign: 'top',
  };

  return (
    <section className="page fade-in" style={{ maxWidth: 920, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-eyebrow">// public · docs</div>
        <div className="page-title">Documentation</div>
        <div className="page-desc">Quickstart guide for the <code>aibreaker</code> Python SDK and CI integration.</div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-label">Installation</div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginBottom: 10 }}>Install the SDK from PyPI:</div>
        <pre style={codeStyle}>{`pip install aibreaker`}</pre>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-label">Quick start</div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginBottom: 10 }}>
          Create a client, kick off a break run, then check <code>report.passed</code>.
        </div>
        <pre style={codeStyle}>{`from aibreaker import BreakerClient
client = BreakerClient(api_key="client_key")
report = client.break_model(
    target={"type": "openai", "base_url": "https://api.openai.com", "api_key": "sk-...", "model_name": "gpt-4o-mini"},
    description="Customer-support chatbot for an e-commerce platform",
    num_tests=20,
    fail_threshold=5.0,
)
print(report)
if not report.passed: raise SystemExit(1)`}</pre>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-label">Supported targets</div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginBottom: 10 }}>
          Provide a <code>target</code> dict when calling <code>break_model</code>.
        </div>
        <div className="table-wrap">
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Required fields</th>
              </tr>
            </thead>
            <tbody>
              {[
                { type: 'openai', fields: ['base_url', 'api_key', 'model_name'] },
                { type: 'huggingface', fields: ['repo_id', 'api_token'] },
                { type: 'webhook', fields: ['endpoint_url', 'payload_template'] },
              ].map((row, idx, arr) => (
                <tr key={row.type}>
                  <td
                    style={{
                      ...tdStyle,
                      fontFamily: 'var(--mono)',
                      color: 'var(--hi)',
                      width: 160,
                      borderBottom: idx === arr.length - 1 ? 'none' : tdStyle.borderBottom,
                    }}
                  >
                    <code>{row.type}</code>
                  </td>
                  <td style={{ ...tdStyle, borderBottom: idx === arr.length - 1 ? 'none' : tdStyle.borderBottom }}>
                    {row.fields.map((f) => (
                      <code key={f} style={{ marginRight: 10, color: 'var(--hi)' }}>{f}</code>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, color: 'var(--mid)', fontSize: 12 }}>
          Tip: the <code>openai</code> target works with any OpenAI-compatible endpoint (Groq, Gemini, vLLM, Ollama, etc).
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-label">GitHub Action</div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginBottom: 10 }}>
          Run Breaker Lab in CI and fail the workflow if score drops below a threshold:
        </div>
        <pre style={codeStyle}>{`- uses: your-org/aibreaker-action@v1
  with:
    api_key: \${{ secrets.BREAKER_API_KEY }}
    endpoint: https://ai-breaker-labs.vercel.app
    description: "Customer support chatbot"
    fail_threshold: "5.0"
    comment_on_pr: "true"
    github_token: \${{ secrets.GITHUB_TOKEN }}`}</pre>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-label">Report object</div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginBottom: 10 }}>
          The SDK returns a typed <code>Report</code> object.
        </div>
        <div className="table-wrap">
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Attribute</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                { a: 'report.report_id', t: 'str', d: 'Unique report ID.' },
                { a: 'report.status', t: 'str', d: 'Job status (e.g. done, processing, failed).' },
                { a: 'report.score', t: 'float', d: 'Average weighted score (0-10).' },
                { a: 'report.passed', t: 'bool', d: 'True when score >= fail_threshold.' },
                { a: 'report.metrics', t: 'Metrics', d: 'Full metrics object (includes judges_agreement, red_flags, etc).' },
                { a: 'report.failures', t: 'tuple[FailedTest, ...]', d: 'Failed test rows.' },
                { a: 'report.results', t: 'tuple[dict, ...]', d: 'Raw per-test rows (advanced use).' },
                { a: 'report.html_report_url', t: 'str | None', d: 'URL to the HTML report (if available).' },
                { a: 'report.report_url', t: 'str', d: 'Convenience URL to view the report.' },
                { a: 'report.failure_count', t: 'int', d: 'Convenience property: number of failures.' },
                { a: 'report.hallucination_count', t: 'int', d: 'Convenience property: hallucinations detected.' },
              ].map((row, idx, arr) => (
                <tr key={row.a}>
                  <td style={{ ...tdStyle, fontFamily: 'var(--mono)', color: 'var(--hi)', borderBottom: idx === arr.length - 1 ? 'none' : tdStyle.borderBottom }}>
                    <code>{row.a}</code>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--mono)', color: 'var(--hi)', width: 220, borderBottom: idx === arr.length - 1 ? 'none' : tdStyle.borderBottom }}>
                    <code>{row.t}</code>
                  </td>
                  <td style={{ ...tdStyle, borderBottom: idx === arr.length - 1 ? 'none' : tdStyle.borderBottom }}>{row.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-label">Error handling</div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginBottom: 10 }}>
          The SDK raises <code>BreakerError</code> for API errors (non-2xx responses), network errors, or when polling times out.
        </div>
        <pre style={codeStyle}>{`from aibreaker import BreakerClient
from aibreaker.client import BreakerError

client = BreakerClient(api_key="client_key")

try:
    report = client.break_model(target=..., description="...", num_tests=20)
except BreakerError as e:
    print("Breaker job failed:", e)
    raise`}</pre>
      </div>
    </section>
  );
}
