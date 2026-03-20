import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Globe, Monitor, Camera, Cpu, Wrench, Play, ExternalLink } from 'lucide-react';
import ScoreRing from '../../components/ScoreRing.jsx';
import FindingCard from '../../components/FindingCard.jsx';
import LoadingSteps from '../../components/LoadingSteps.jsx';
import CopyButton from '../../components/CopyButton.jsx';

const DEMO_URL = 'https://demo-saas-app.vercel.app';

export default function DemoPage() {
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState('idle');
  const [currentStep, setCurrentStep] = useState(0);

  const loadingSteps = [
    { label: t('public.demo.loadingSteps.launching'), icon: <Globe size={14} /> },
    { label: t('public.demo.loadingSteps.crawling'), icon: <Monitor size={14} /> },
    { label: t('public.demo.loadingSteps.capturing'), icon: <Camera size={14} /> },
    { label: t('public.demo.loadingSteps.sending'), icon: <Cpu size={14} /> },
    { label: t('public.demo.loadingSteps.generating'), icon: <Wrench size={14} /> },
  ];

  const findings = [
    {
      severity: 'critical',
      category: 'flow',
      title: t('public.demo.findingsData.checkoutTitle'),
      description: t('public.demo.findingsData.checkoutDesc'),
      fixPrompt: 'In your CheckoutForm component add:\n  position: relative;\n  z-index: 10;\nand ensure the parent has overflow: visible',
    },
    {
      severity: 'critical',
      category: 'logic',
      title: t('public.demo.findingsData.signupTitle'),
      description: t('public.demo.findingsData.signupDesc'),
      fixPrompt: "Before calling createUser() add:\n  if (!email || !email.includes('@')) {\n    setError('Please enter a valid email');\n    return;\n  }",
    },
    {
      severity: 'warning',
      category: 'layout',
      title: t('public.demo.findingsData.heroOverflowTitle'),
      description: null,
      fixPrompt: 'Add word-wrap: break-word and max-width: 100% to your HeroHeadline CSS class',
    },
    {
      severity: 'warning',
      category: 'accessibility',
      title: t('public.demo.findingsData.contrastTitle'),
      description: null,
      fixPrompt: 'Change button text color from #AAAAAA to #1A1A1A',
    },
    {
      severity: 'warning',
      category: 'layout',
      title: t('public.demo.findingsData.pricingCollapseTitle'),
      description: null,
      fixPrompt: 'Change grid-template-columns: repeat(3, 1fr) to repeat(auto-fit, minmax(220px, 1fr))',
    },
    {
      severity: 'info',
      category: 'accessibility',
      title: t('public.demo.findingsData.missingAltTitle'),
      description: null,
      fixPrompt: null,
    },
  ];

  const allFixPrompts = findings
    .filter((finding) => finding.fixPrompt)
    .map((finding, index) => `${index + 1}. ${finding.title}\n${finding.fixPrompt}`)
    .join('\n\n');

  const startDemo = useCallback(() => {
    setPhase('loading');
    setCurrentStep(0);

    const stepDuration = 2000;
    for (let i = 1; i <= loadingSteps.length; i += 1) {
      setTimeout(() => {
        setCurrentStep(i);
        if (i === loadingSteps.length) {
          setTimeout(() => setPhase('results'), 800);
        }
      }, stepDuration * i);
    }
  }, [loadingSteps.length]);

  return (
    <div className="fade-in" style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '48px 40px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div className="page-eyebrow">{t('public.demo.eyebrow')}</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 12 }}>
          {t('public.demo.title')}
        </h1>
        <p style={{ fontSize: 17, color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto' }}>
          {t('public.demo.subtitle')}
        </p>
      </div>

      <div className="card" style={{ padding: 28, marginBottom: 24, background: 'var(--bg-raised)' }}>
        <div className="card-label">{t('public.demo.targetUrl')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 20 }}>
          <Globe size={16} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-muted)', flex: 1 }}>
            {DEMO_URL}
          </span>
          <ExternalLink size={14} style={{ color: 'var(--text-dim)' }} />
        </div>

        {phase === 'idle' && (
          <button className="btn btn-primary-lg" onClick={startDemo} style={{ width: '100%' }}>
            {t('public.demo.watchDemo')} <ArrowRight size={18} style={{ transform: i18n.dir() === 'rtl' ? 'scaleX(-1)' : undefined }} />
          </button>
        )}
      </div>

      {phase === 'loading' && (
        <div className="slide-up" style={{ marginBottom: 24 }}>
          <LoadingSteps steps={loadingSteps} currentStep={currentStep} done={currentStep >= loadingSteps.length} />
        </div>
      )}

      {phase === 'results' && (
        <div className="slide-up">
          <div className="card" style={{ padding: 32, marginBottom: 24, background: 'linear-gradient(135deg, rgba(59, 180, 255, 0.06), rgba(251, 191, 36, 0.04))', borderColor: 'rgba(59, 180, 255, 0.15)', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <ScoreRing score={67} size={140} label="/100" />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                {t('public.demo.reliabilityScore', { score: 67 })}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <span className="badge badge-amber">{t('public.demo.needsWork')}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 'var(--radius-full)', background: 'var(--accent-dim)', border: '1px solid rgba(59, 180, 255, 0.2)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>
                  {t('public.demo.confidence', { value: 84 })}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {t('public.demo.resultsSummary')}
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div className="card-label" style={{ marginBottom: 12 }}>
              {t('public.demo.findings', { count: findings.length })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {findings.map((finding, index) => (
                <FindingCard key={index} {...finding} />
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ background: 'var(--bg-deepest)', height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, cursor: 'pointer', position: 'relative' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(59, 180, 255, 0.15)', border: '2px solid rgba(59, 180, 255, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={24} style={{ color: 'var(--accent)', marginInlineStart: 2 }} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>
                  {t('public.demo.sessionReplay')}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {t('public.demo.sessionReplayLabel')}
                </div>
              </div>
              <div style={{ position: 'absolute', bottom: 12, insetInlineEnd: 16, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                0:42
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 40 }}>
            <CopyButton text={allFixPrompts} label={t('public.demo.copyFixPrompts')} size="lg" />
          </div>

          <div style={{ background: 'linear-gradient(135deg, rgba(59, 180, 255, 0.08), rgba(52, 211, 153, 0.05))', border: '1px solid rgba(59, 180, 255, 0.15)', borderRadius: 'var(--radius-xl)', padding: '60px 40px', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 12 }}>
              {t('public.demo.ctaTitleLine1')}
              <br />
              {t('public.demo.ctaTitleLine2Prefix')} <span style={{ color: 'var(--accent)' }}>{t('public.demo.ctaTitleLine2Accent')}</span>?
            </h2>
            <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '0 auto 28px', maxWidth: 440 }}>
              {t('public.demo.ctaSubtitle')}
            </p>
            <Link to="/auth/signup" className="btn btn-primary-lg">
              {t('public.demo.ctaButton')} <ArrowRight size={18} style={{ transform: i18n.dir() === 'rtl' ? 'scaleX(-1)' : undefined }} />
            </Link>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 14 }}>
              {t('public.demo.footnote')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
