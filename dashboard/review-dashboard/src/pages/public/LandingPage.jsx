import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Eye, Wrench, Zap, BarChart3, Code } from 'lucide-react';

const FEATURES = [
  { icon: Eye, title: 'AI Vision Audit', desc: 'Sees your app like a real user — catches visual bugs, broken flows, and dead clicks.' },
  { icon: Wrench, title: 'Copy-Paste Fix Prompts', desc: 'Every bug comes with a prompt you can paste directly into Cursor, Bolt, or Lovable.' },
  { icon: Zap, title: '60-Second Vibe Check', desc: 'Just paste a URL. Get a reliability score in under a minute — no config, no setup.' },
  { icon: Shield, title: 'Mobile + Desktop Coverage', desc: 'Tests both viewports side-by-side. Catches what Chrome DevTools misses.' },
  { icon: BarChart3, title: 'Monitoring & Regression', desc: 'Set it and forget it. Get alerted the moment your reliability score drops.' },
  { icon: Code, title: 'CI/CD & API Ready', desc: 'Run audits from your pipeline. Block deploys that ship broken flows.' },
];

const SOCIAL_PROOF = [
  { num: '2,100+', label: 'Apps audited' },
  { num: '14,000+', label: 'Bugs found' },
  { num: '200+', label: 'Founders using it' },
];

export default function LandingPage() {
  return (
    <div className="fade-in">
      {/* ── Hero ──────────────────────────────────────────── */}
      <section style={{
        maxWidth: 'var(--max-width)',
        margin: '0 auto',
        padding: '80px 40px 60px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--accent-dim)',
          border: '1px solid rgba(59, 180, 255, 0.15)',
          marginBottom: 28,
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--accent)',
        }}>
          <Zap size={14} />
          The reliability layer for AI-built apps
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(36px, 5vw, 64px)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.03em',
          lineHeight: 1.08,
          maxWidth: 800,
          margin: '0 auto 24px',
        }}>
          Ship AI-built apps without the
          <span style={{ color: 'var(--accent)' }}> embarrassing breakage</span>
        </h1>

        <p style={{
          fontSize: 18,
          color: 'var(--text-secondary)',
          maxWidth: 600,
          margin: '0 auto 36px',
          lineHeight: 1.6,
        }}>
          AiBreaker watches your app like a real user, runs adversarial web QA,
          and hands you a fix prompt you can paste back into your AI builder.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/demo" className="btn btn-primary-lg">
            Run a Free Vibe Check <ArrowRight size={18} />
          </Link>
          <Link to="/pricing" className="btn btn-ghost" style={{ padding: '14px 28px', fontSize: 16 }}>
            See Pricing
          </Link>
        </div>

        <p style={{
          fontSize: 12,
          color: 'var(--text-dim)',
          marginTop: 16,
          fontFamily: 'var(--font-mono)',
        }}>
          No credit card · Free forever · Cancel anytime
        </p>
      </section>

      {/* ── Social proof ────────────────────────────────── */}
      <section style={{
        maxWidth: 'var(--max-width)',
        margin: '0 auto',
        padding: '0 40px 60px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 48,
          flexWrap: 'wrap',
          padding: '24px 0',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}>
          {SOCIAL_PROOF.map((item) => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                fontWeight: 700,
                color: 'var(--accent)',
              }}>
                {item.num}
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.05em',
              }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features grid ───────────────────────────────── */}
      <section style={{
        maxWidth: 'var(--max-width)',
        margin: '0 auto',
        padding: '0 40px 80px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="page-eyebrow">Features</div>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 32,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}>
            Everything you need to ship with confidence
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}>
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="card" style={{
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: 'var(--accent)',
                }}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3 style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: 4,
                  }}>
                    {feature.title}
                  </h3>
                  <p style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}>
                    {feature.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA section ─────────────────────────────────── */}
      <section style={{
        maxWidth: 'var(--max-width)',
        margin: '0 auto',
        padding: '0 40px 80px',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(59, 180, 255, 0.08), rgba(52, 211, 153, 0.05))',
          border: '1px solid rgba(59, 180, 255, 0.15)',
          borderRadius: 'var(--radius-xl)',
          padding: '60px 40px',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 12,
          }}>
            Ready to stop shipping broken apps?
          </h2>
          <p style={{
            fontSize: 16,
            color: 'var(--text-secondary)',
            marginBottom: 28,
          }}>
            Try AiBreaker free — no signup required for the demo.
          </p>
          <Link to="/demo" className="btn btn-primary-lg">
            Try the Demo <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--line)',
        padding: '32px 40px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--text-dim)',
        fontFamily: 'var(--font-mono)',
      }}>
        © 2026 AiBreaker · Built for the AI-built web
      </footer>
    </div>
  );
}
