import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronUp, ArrowRight, Zap, Search, Wrench } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

const TIER_ICONS = {
  vibe: Zap,
  deep: Search,
  fix: Wrench,
};

function renderCell(value) {
  if (value === true) return <Check size={16} style={{ color: 'var(--green)' }} />;
  if (value === false) return <span style={{ color: 'var(--text-dim)' }}>-</span>;
  return <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{value}</span>;
}

export default function PricingPage() {
  const { t, i18n } = useTranslation();
  const [openFaq, setOpenFaq] = useState(null);
  const { isAuthenticated, loading } = useAuth();

  const tiers = [
    {
      id: 'vibe',
      popular: false,
      featureKeys: ['fiveAudits', 'desktopMobile', 'score', 'topFindings', 'copyPrompts', 'shareLinks'],
    },
    {
      id: 'deep',
      popular: true,
      featureKeys: ['unlimited', 'everythingVibe', 'videoReplay', 'journeyTesting', 'screenshots', 'alerts', 'apiAccess', 'prioritySupport'],
    },
    {
      id: 'fix',
      popular: false,
      featureKeys: ['everythingDeep', 'aiFix', 'rerun', 'sourceAnalysis', 'ci', 'customReporting', 'dedicatedSupport', 'sla'],
    },
  ];

  const comparisonRows = [
    { feature: t('public.pricing.comparison.monthlyAudits'), vibe: '5', deep: t('public.pricing.comparison.unlimited'), fix: t('public.pricing.comparison.unlimited') },
    { feature: t('public.pricing.comparison.reliabilityScore'), vibe: true, deep: true, fix: true },
    { feature: t('public.pricing.comparison.fixPrompts'), vibe: true, deep: true, fix: true },
    { feature: t('public.pricing.comparison.videoReplay'), vibe: false, deep: true, fix: true },
    { feature: t('public.pricing.comparison.journeyTesting'), vibe: false, deep: true, fix: true },
    { feature: t('public.pricing.comparison.monitoring'), vibe: false, deep: true, fix: true },
    { feature: t('public.pricing.comparison.aiFixGeneration'), vibe: false, deep: false, fix: true },
    { feature: t('public.pricing.comparison.sourceCodeAnalysis'), vibe: false, deep: false, fix: true },
    { feature: t('public.pricing.comparison.ciCd'), vibe: false, deep: false, fix: true },
    { feature: t('public.pricing.comparison.apiAccess'), vibe: false, deep: true, fix: true },
    { feature: t('public.pricing.comparison.prioritySupport'), vibe: false, deep: true, fix: true },
  ];

  const faqs = [
    { q: t('public.pricing.faqs.testQ'), a: t('public.pricing.faqs.testA') },
    { q: t('public.pricing.faqs.installQ'), a: t('public.pricing.faqs.installA') },
    { q: t('public.pricing.faqs.differenceQ'), a: t('public.pricing.faqs.differenceA') },
    { q: t('public.pricing.faqs.cancelQ'), a: t('public.pricing.faqs.cancelA') },
    { q: t('public.pricing.faqs.securityQ'), a: t('public.pricing.faqs.securityA') },
  ];

  return (
    <div className="fade-in" style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '56px 40px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div className="page-eyebrow">{t('public.pricing.eyebrow')}</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 12 }}>
          {t('public.pricing.title')}
        </h1>
        <p style={{ fontSize: 17, color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
          {t('public.pricing.subtitle')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 56, alignItems: 'start' }}>
        {tiers.map((tier) => {
          const Icon = TIER_ICONS[tier.id];
          return (
            <div
              key={tier.id}
              style={{
                background: 'var(--bg-raised)',
                border: tier.popular ? '2px solid var(--accent)' : '1px solid var(--line)',
                borderRadius: 'var(--radius-xl)',
                padding: 28,
                position: 'relative',
                boxShadow: tier.popular ? '0 0 40px rgba(59, 180, 255, 0.1), 0 0 80px rgba(59, 180, 255, 0.05)' : 'none',
                transform: tier.popular ? 'scale(1.02)' : 'none',
              }}
            >
              {tier.popular && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '4px 16px', borderRadius: 'var(--radius-full)', background: 'var(--accent)', color: '#020810', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {t('public.pricing.mostPopular')}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: tier.popular ? 'var(--accent-dim)' : 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: tier.popular ? 'var(--accent)' : 'var(--text-muted)' }}>
                  <Icon size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                    {t(`public.pricing.tiers.${tier.id}.name`)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {t(`public.pricing.tiers.${tier.id}.tagline`)}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t(`public.pricing.tiers.${tier.id}.price`)}
                </span>
                <span style={{ fontSize: 14, color: 'var(--text-muted)', marginInlineStart: 4 }}>
                  {t(`public.pricing.tiers.${tier.id}.period`)}
                </span>
              </div>

              <Link to={!loading && isAuthenticated ? '/app/settings/billing' : `/auth/signup?plan=${tier.id}`} className={tier.popular ? 'btn btn-primary' : 'btn btn-ghost'} style={{ width: '100%', textAlign: 'center', marginBottom: 20, justifyContent: 'center' }}>
                {t(`public.pricing.tiers.${tier.id}.cta`)}
              </Link>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tier.featureKeys.map((featureKey) => (
                  <div key={featureKey} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <Check size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />
                    {t(`public.pricing.features.${featureKey}`)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: 56 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 24 }}>
          {t('public.pricing.comparisonTitle')}
        </h2>
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>{t('public.pricing.comparisonHeaders.feature')}</th>
                <th style={{ textAlign: 'center' }}>{t('public.pricing.comparisonHeaders.vibe')}</th>
                <th style={{ textAlign: 'center' }}>{t('public.pricing.comparisonHeaders.deep')}</th>
                <th style={{ textAlign: 'center' }}>{t('public.pricing.comparisonHeaders.fix')}</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.feature}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{row.feature}</td>
                  <td style={{ textAlign: 'center' }}>{renderCell(row.vibe)}</td>
                  <td style={{ textAlign: 'center' }}>{renderCell(row.deep)}</td>
                  <td style={{ textAlign: 'center' }}>{renderCell(row.fix)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ margin: '0 auto 56px', maxWidth: 700 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 24 }}>
          {t('public.pricing.faqTitle')}
        </h2>
        {faqs.map((faq, index) => (
          <div key={faq.q} className="accordion-item">
            <button className="accordion-trigger" onClick={() => setOpenFaq(openFaq === index ? null : index)}>
              {faq.q}
              {openFaq === index ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {openFaq === index && <div className="accordion-content">{faq.a}</div>}
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 12 }}>
          {t('public.pricing.bottomCta')}
        </p>
        <Link to="/demo" className="btn btn-ghost">
          {t('public.pricing.watchDemo')} <ArrowRight size={16} style={{ transform: i18n.dir() === 'rtl' ? 'scaleX(-1)' : undefined }} />
        </Link>
      </div>
    </div>
  );
}
