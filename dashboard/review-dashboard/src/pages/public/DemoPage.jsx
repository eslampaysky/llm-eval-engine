import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Globe, Smartphone, Monitor, Camera,
  Cpu, Wrench, Play, Copy, Check, ExternalLink
} from 'lucide-react';
import ScoreRing from '../../components/ScoreRing.jsx';
import FindingCard from '../../components/FindingCard.jsx';
import LoadingSteps from '../../components/LoadingSteps.jsx';
import CopyButton from '../../components/CopyButton.jsx';

const DEMO_URL = 'https://demo-saas-app.vercel.app';

const LOADING_STEPS = [
  { label: 'Launching browser...', icon: <Globe size={14} /> },
  { label: 'Crawling pages — desktop + mobile...', icon: <Monitor size={14} /> },
  { label: 'Capturing screenshots...', icon: <Camera size={14} /> },
  { label: 'Sending to AI vision model...', icon: <Cpu size={14} /> },
  { label: 'Generating fix prompts...', icon: <Wrench size={14} /> },
];

const FINDINGS = [
  {
    severity: 'critical',
    category: 'flow',
    title: 'Checkout button unreachable on mobile',
    description: 'The checkout button is positioned behind the footer on screens below 430px. Users on iPhone cannot complete a purchase.',
    fixPrompt: 'In your CheckoutForm component add:\n  position: relative;\n  z-index: 10;\nand ensure the parent has overflow: visible',
  },
  {
    severity: 'critical',
    category: 'logic',
    title: 'Signup form accepts empty emails',
    description: 'The signup form submits successfully with an empty email field, creating invalid user accounts.',
    fixPrompt: 'Before calling createUser() add:\n  if (!email || !email.includes(\'@\')) {\n    setError(\'Please enter a valid email\');\n    return;\n  }',
  },
  {
    severity: 'warning',
    category: 'layout',
    title: 'Hero headline overflows on tablet',
    description: null,
    fixPrompt: 'Add word-wrap: break-word and max-width: 100% to your HeroHeadline CSS class',
  },
  {
    severity: 'warning',
    category: 'accessibility',
    title: 'CTA button contrast ratio 2.1:1 — fails WCAG AA',
    description: null,
    fixPrompt: 'Change button text color from #AAAAAA to #1A1A1A',
  },
  {
    severity: 'warning',
    category: 'layout',
    title: 'Pricing table collapses incorrectly on tablet',
    description: null,
    fixPrompt: 'Change grid-template-columns: repeat(3, 1fr) to repeat(auto-fit, minmax(220px, 1fr))',
  },
  {
    severity: 'info',
    category: 'accessibility',
    title: '3 images missing alt text',
    description: null,
    fixPrompt: null,
  },
];

const ALL_FIX_PROMPTS = FINDINGS
  .filter(f => f.fixPrompt)
  .map((f, i) => `${i + 1}. ${f.title}\n${f.fixPrompt}`)
  .join('\n\n');

export default function DemoPage() {
  const [phase, setPhase] = useState('idle'); // idle | loading | results
  const [currentStep, setCurrentStep] = useState(0);

  const startDemo = useCallback(() => {
    setPhase('loading');
    setCurrentStep(0);

    // Animate through steps
    const stepDuration = 2000;
    for (let i = 1; i <= LOADING_STEPS.length; i++) {
      setTimeout(() => {
        setCurrentStep(i);
        if (i === LOADING_STEPS.length) {
          setTimeout(() => setPhase('results'), 800);
        }
      }, stepDuration * i);
    }
  }, []);

  return (
    <div className="fade-in" style={{
      maxWidth: 'var(--max-width)',
      margin: '0 auto',
      padding: '48px 40px 80px',
    }}>
      {/* ── Hero ──────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div className="page-eyebrow">Live Demo</div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(28px, 4vw, 48px)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          marginBottom: 12,
        }}>
          See AiBreaker in action
        </h1>
        <p style={{
          fontSize: 17,
          color: 'var(--text-secondary)',
          maxWidth: 520,
          margin: '0 auto',
        }}>
          Watch it find real bugs in a real AI-built app.
          No signup, no waiting.
        </p>
      </div>

      {/* ── URL bar + trigger ─────────────────────────────── */}
      <div className="card" style={{
        padding: 28,
        marginBottom: 24,
        background: 'var(--bg-raised)',
      }}>
        <div className="card-label">Target URL</div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--bg-surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: 20,
        }}>
          <Globe size={16} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            color: 'var(--text-muted)',
            flex: 1,
          }}>
            {DEMO_URL}
          </span>
          <ExternalLink size={14} style={{ color: 'var(--text-dim)' }} />
        </div>

        {phase === 'idle' && (
          <button
            className="btn btn-primary-lg"
            onClick={startDemo}
            style={{ width: '100%' }}
          >
            Watch Demo Audit <ArrowRight size={18} />
          </button>
        )}
      </div>

      {/* ── Loading sequence ──────────────────────────────── */}
      {phase === 'loading' && (
        <div className="slide-up" style={{ marginBottom: 24 }}>
          <LoadingSteps
            steps={LOADING_STEPS}
            currentStep={currentStep}
            done={currentStep >= LOADING_STEPS.length}
          />
        </div>
      )}

      {/* ── Results ───────────────────────────────────────── */}
      {phase === 'results' && (
        <div className="slide-up">
          {/* Score header */}
          <div className="card" style={{
            padding: 32,
            marginBottom: 24,
            background: 'linear-gradient(135deg, rgba(59, 180, 255, 0.06), rgba(251, 191, 36, 0.04))',
            borderColor: 'rgba(59, 180, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 32,
            flexWrap: 'wrap',
          }}>
            <ScoreRing score={67} size={140} label="/100" />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 8,
              }}>
                Reliability Score: 67
              </div>
              <div style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginBottom: 12,
              }}>
                <span className="badge badge-amber">Needs Work</span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--accent-dim)',
                  border: '1px solid rgba(59, 180, 255, 0.2)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--accent)',
                }}>
                  84% confident
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                2 critical issues, 3 warnings, 1 informational finding detected across desktop and mobile viewports.
              </p>
            </div>
          </div>

          {/* Findings */}
          <div style={{ marginBottom: 24 }}>
            <div className="card-label" style={{ marginBottom: 12 }}>
              Findings ({FINDINGS.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FINDINGS.map((f, i) => (
                <FindingCard key={i} {...f} />
              ))}
            </div>
          </div>

          {/* Video replay placeholder */}
          <div className="card" style={{
            padding: 0,
            marginBottom: 24,
            overflow: 'hidden',
          }}>
            <div style={{
              background: 'var(--bg-deepest)',
              height: 280,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              cursor: 'pointer',
              position: 'relative',
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(59, 180, 255, 0.15)',
                border: '2px solid rgba(59, 180, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Play size={24} style={{ color: 'var(--accent)', marginLeft: 2 }} />
              </div>
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  textAlign: 'center',
                }}>
                  Session Replay
                </div>
                <div style={{
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                  marginTop: 4,
                }}>
                  Checkout Flow Failure
                </div>
              </div>
              <div style={{
                position: 'absolute',
                bottom: 12,
                right: 16,
                fontSize: 11,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
              }}>
                0:42
              </div>
            </div>
          </div>

          {/* Copy all fix prompts */}
          <div style={{ marginBottom: 40 }}>
            <CopyButton
              text={ALL_FIX_PROMPTS}
              label="Copy All Fix Prompts"
              size="lg"
            />
          </div>

          {/* Bottom CTA */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(59, 180, 255, 0.08), rgba(52, 211, 153, 0.05))',
            border: '1px solid rgba(59, 180, 255, 0.15)',
            borderRadius: 'var(--radius-xl)',
            padding: '60px 40px',
            textAlign: 'center',
          }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(24px, 3.5vw, 36px)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              marginBottom: 12,
            }}>
              That was someone else's app.
              <br />
              What about <span style={{ color: 'var(--accent)' }}>yours</span>?
            </h2>
            <p style={{
              fontSize: 16,
              color: 'var(--text-secondary)',
              marginBottom: 28,
              maxWidth: 440,
              margin: '0 auto 28px',
            }}>
              Sign up free and run a real audit on your app in 60 seconds.
            </p>
            <Link to="/auth/signup" className="btn btn-primary-lg">
              Audit My App Free <ArrowRight size={18} />
            </Link>
            <p style={{
              fontSize: 12,
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              marginTop: 14,
            }}>
              No credit card · Free forever · Cancel anytime
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
