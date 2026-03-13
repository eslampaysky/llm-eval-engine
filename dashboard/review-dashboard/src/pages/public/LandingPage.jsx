import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function LandingPage() {
  const isMobile = useIsMobile();

  return (
    <section className="page fade-in" style={{ maxWidth: 1180, margin: '0 auto', paddingTop: 56, paddingBottom: 56 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1.2fr .8fr',
        gap: 20,
        alignItems: 'start',
      }}>
        <div>
          <div className="page-eyebrow">// public · landing</div>
          <h1 className="page-title" style={{
            fontSize: isMobile ? 32 : 52,
            lineHeight: 1.02,
            marginBottom: 16,
          }}>
            Break your AI before users do.
          </h1>
          <div className="page-desc" style={{ maxWidth: 640, fontSize: 16 }}>
            AI Breaker Labs stress-tests LLM applications for hallucinations, safety failures, regressions, and prompt attacks so your team can ship with evidence instead of guesswork.
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" to="/auth/signup">Start Free</Link>
            <Link className="btn btn-ghost" to="/demo">Try Live Demo</Link>
            <Link className="btn btn-ghost" to="/pricing">View Pricing</Link>
          </div>
        </div>

        <div className="card">
          <div className="card-label">What AI Breaker does</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              'Generates adversarial and safety-focused test suites.',
              'Runs your target model against real break scenarios.',
              'Scores outputs with judge models and detailed evidence.',
              'Tracks regressions across versions and releases.',
            ].map((item) => (
              <div key={item} style={{
                padding: '12px 14px',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r)',
                background: 'var(--bg2)',
                color: 'var(--mid)',
              }}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
        gap: 14,
        marginTop: 26,
      }}>
        {[
          ['Adversarial coverage', 'Probe jailbreaks, prompt injection, hallucinations, and unsafe edge cases.'],
          ['Operational insight', 'Compare runs, inspect failures, and build a repeatable review workflow.'],
          ['SaaS-ready workflow', 'Share reports with your team and centralize model evaluation in one place.'],
        ].map(([title, copy]) => (
          <div key={title} className="card">
            <div className="card-label">{title}</div>
            <div style={{ color: 'var(--mid)' }}>{copy}</div>
          </div>
        ))}
      </div>
    </section>
  );
}