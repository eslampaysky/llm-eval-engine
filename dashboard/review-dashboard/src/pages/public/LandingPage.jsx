import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Shield, Eye, Wrench, Zap, BarChart3, Code } from 'lucide-react';

const FEATURE_ICONS = [Eye, Wrench, Zap, Shield, BarChart3, Code];

export default function LandingPage() {
  const { t, i18n } = useTranslation();

  const socialProof = [
    { value: t('public.landing.socialProof.appsAuditedValue'), label: t('public.landing.socialProof.appsAuditedLabel') },
    { value: t('public.landing.socialProof.bugsFoundValue'), label: t('public.landing.socialProof.bugsFoundLabel') },
    { value: t('public.landing.socialProof.foundersValue'), label: t('public.landing.socialProof.foundersLabel') },
  ];

  const features = [
    { title: t('public.landing.features.visionTitle'), desc: t('public.landing.features.visionDesc') },
    { title: t('public.landing.features.promptsTitle'), desc: t('public.landing.features.promptsDesc') },
    { title: t('public.landing.features.vibeTitle'), desc: t('public.landing.features.vibeDesc') },
    { title: t('public.landing.features.coverageTitle'), desc: t('public.landing.features.coverageDesc') },
    { title: t('public.landing.features.monitoringTitle'), desc: t('public.landing.features.monitoringDesc') },
    { title: t('public.landing.features.apiTitle'), desc: t('public.landing.features.apiDesc') },
  ];

  return (
    <div className="fade-in">
      <section style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '80px 40px 60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 'var(--radius-full)', background: 'var(--accent-dim)', border: '1px solid rgba(59, 180, 255, 0.15)', marginBottom: 28, fontSize: 12, fontWeight: 500, color: 'var(--accent)' }}>
          <Zap size={14} />
          {t('public.landing.badge')}
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.08, maxWidth: 800, margin: '0 auto 24px' }}>
          {t('public.landing.heroTitlePrefix')} <span style={{ color: 'var(--accent)' }}>{t('public.landing.heroTitleAccent')}</span>
        </h1>

        <p style={{ fontSize: 18, color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.6 }}>
          {t('public.landing.heroSubtitle')}
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/demo" className="btn btn-primary-lg">
            {t('public.landing.primaryCta')} <ArrowRight size={18} style={{ transform: i18n.dir() === 'rtl' ? 'scaleX(-1)' : undefined }} />
          </Link>
          <Link to="/pricing" className="btn btn-ghost" style={{ padding: '14px 28px', fontSize: 16 }}>
            {t('public.landing.secondaryCta')}
          </Link>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 16, fontFamily: 'var(--font-mono)' }}>
          {t('public.landing.footnote')}
        </p>
      </section>

      <section style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '0 40px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 48, flexWrap: 'wrap', padding: '24px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
          {socialProof.map((item) => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>
                {item.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '0 40px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="page-eyebrow">{t('public.landing.featuresEyebrow')}</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {t('public.landing.featuresTitle')}
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {features.map((feature, index) => {
            const Icon = FEATURE_ICONS[index];
            return (
              <div key={feature.title} className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--accent)' }}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {feature.title}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {feature.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '0 40px 80px' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(59, 180, 255, 0.08), rgba(52, 211, 153, 0.05))', border: '1px solid rgba(59, 180, 255, 0.15)', borderRadius: 'var(--radius-xl)', padding: '60px 40px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
            {t('public.landing.ctaTitle')}
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 28 }}>
            {t('public.landing.ctaSubtitle')}
          </p>
          <Link to="/demo" className="btn btn-primary-lg">
            {t('public.landing.ctaButton')} <ArrowRight size={18} style={{ transform: i18n.dir() === 'rtl' ? 'scaleX(-1)' : undefined }} />
          </Link>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--line)', padding: '32px 40px', textAlign: 'center', fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
        {t('public.landing.footer')}
      </footer>
    </div>
  );
}
