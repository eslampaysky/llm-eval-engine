import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp, ArrowRight, Zap, Search, Wrench } from 'lucide-react';

const TIERS = [
  {
    id: 'vibe',
    name: 'Vibe Check',
    price: 'Free',
    period: 'forever',
    tagline: 'Quick reliability scan',
    icon: Zap,
    cta: 'Get Started Free',
    ctaLink: '/auth/signup',
    popular: false,
    features: [
      '5 audits per month',
      'Desktop + mobile scan',
      'Reliability score (0-100)',
      'Top 5 findings',
      'Copy-paste fix prompts',
      'Public share links',
    ],
  },
  {
    id: 'deep',
    name: 'Deep Dive',
    price: '$29',
    period: '/month',
    tagline: 'Full audit with video replay',
    icon: Search,
    cta: 'Start Deep Dive',
    ctaLink: '/auth/signup',
    popular: true,
    features: [
      'Unlimited audits',
      'Everything in Vibe Check',
      'Video session replay',
      'User journey testing',
      'Screenshot comparisons',
      'Monitoring & alerts',
      'API access',
      'Priority support',
    ],
  },
  {
    id: 'fix',
    name: 'Fix & Verify',
    price: '$79',
    period: '/month',
    tagline: 'AI-powered fixes + verification',
    icon: Wrench,
    cta: 'Start Fixing',
    ctaLink: '/auth/signup',
    popular: false,
    features: [
      'Everything in Deep Dive',
      'AI fix generation',
      'Re-run verification',
      'Source code analysis',
      'CI/CD integration',
      'Custom reporting',
      'Dedicated support',
      'SLA guarantee',
    ],
  },
];

const COMPARISON = [
  { feature: 'Monthly audits', vibe: '5', deep: 'Unlimited', fix: 'Unlimited' },
  { feature: 'Reliability score', vibe: true, deep: true, fix: true },
  { feature: 'Fix prompts', vibe: true, deep: true, fix: true },
  { feature: 'Video replay', vibe: false, deep: true, fix: true },
  { feature: 'Journey testing', vibe: false, deep: true, fix: true },
  { feature: 'Monitoring', vibe: false, deep: true, fix: true },
  { feature: 'AI fix generation', vibe: false, deep: false, fix: true },
  { feature: 'Source code analysis', vibe: false, deep: false, fix: true },
  { feature: 'CI/CD integration', vibe: false, deep: false, fix: true },
  { feature: 'API access', vibe: false, deep: true, fix: true },
  { feature: 'Priority support', vibe: false, deep: true, fix: true },
];

const FAQS = [
  {
    q: 'What exactly does AiBreaker test?',
    a: 'AiBreaker crawls your app like a real user on both desktop and mobile. It screens for broken UI flows, dead clicks, visual bugs, accessibility issues, and logic errors — then hands you a fix prompt for each one.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'Nope. Just paste your public URL and hit "Run Audit." AiBreaker uses its own headless browser — no SDK, no code changes, no deploys required.',
  },
  {
    q: 'How is this different from Lighthouse or Playwright?',
    a: 'Lighthouse measures performance. Playwright requires you to write scripts. AiBreaker does visual + behavioral QA with AI — no script writing, and it generates fix prompts automatically.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. No contracts, no lock-in. Cancel from your billing settings and your plan ends at the next billing cycle. Your audit history stays available on the free tier.',
  },
  {
    q: 'Is my site data secure?',
    a: 'We only audit publicly accessible pages. Screenshots and recordings are encrypted at rest and deleted after 30 days. We never access your source code unless you explicitly paste it in the Fix & Verify tier.',
  },
];

function renderCell(val) {
  if (val === true) return <Check size={16} style={{ color: 'var(--green)' }} />;
  if (val === false) return <span style={{ color: 'var(--text-dim)' }}>—</span>;
  return <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{val}</span>;
}

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="fade-in" style={{
      maxWidth: 'var(--max-width)',
      margin: '0 auto',
      padding: '56px 40px 80px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div className="page-eyebrow">Pricing</div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(28px, 4vw, 44px)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
          marginBottom: 12,
        }}>
          Simple, transparent pricing
        </h1>
        <p style={{ fontSize: 17, color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
          Start free. Upgrade when you need deeper audits and AI-powered fixes.
        </p>
      </div>

      {/* Tier cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20,
        marginBottom: 56,
        alignItems: 'start',
      }}>
        {TIERS.map((tier) => {
          const Icon = tier.icon;
          return (
            <div key={tier.id} style={{
              background: 'var(--bg-raised)',
              border: tier.popular
                ? '2px solid var(--accent)'
                : '1px solid var(--line)',
              borderRadius: 'var(--radius-xl)',
              padding: 28,
              position: 'relative',
              boxShadow: tier.popular
                ? '0 0 40px rgba(59, 180, 255, 0.1), 0 0 80px rgba(59, 180, 255, 0.05)'
                : 'none',
              transform: tier.popular ? 'scale(1.02)' : 'none',
            }}>
              {tier.popular && (
                <div style={{
                  position: 'absolute',
                  top: -12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '4px 16px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--accent)',
                  color: '#020810',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}>
                  Most Popular
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  background: tier.popular ? 'var(--accent-dim)' : 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: tier.popular ? 'var(--accent)' : 'var(--text-muted)',
                }}>
                  <Icon size={18} />
                </div>
                <div>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-display)',
                  }}>
                    {tier.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {tier.tagline}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 40,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}>
                  {tier.price}
                </span>
                <span style={{
                  fontSize: 14,
                  color: 'var(--text-muted)',
                  marginLeft: 4,
                }}>
                  {tier.period}
                </span>
              </div>

              <Link
                to={tier.ctaLink}
                className={tier.popular ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ width: '100%', textAlign: 'center', marginBottom: 20, justifyContent: 'center' }}
              >
                {tier.cta}
              </Link>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tier.features.map((feature) => (
                  <div key={feature} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                  }}>
                    <Check size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison table */}
      <div style={{ marginBottom: 56 }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--text-primary)',
          textAlign: 'center',
          marginBottom: 24,
        }}>
          Feature comparison
        </h2>
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Feature</th>
                <th style={{ textAlign: 'center' }}>Vibe Check</th>
                <th style={{ textAlign: 'center' }}>Deep Dive</th>
                <th style={{ textAlign: 'center' }}>Fix &amp; Verify</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
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

      {/* FAQ */}
      <div style={{ marginBottom: 56, maxWidth: 700, margin: '0 auto 56px' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--text-primary)',
          textAlign: 'center',
          marginBottom: 24,
        }}>
          Frequently asked questions
        </h2>
        {FAQS.map((faq, i) => (
          <div key={i} className="accordion-item">
            <button
              className="accordion-trigger"
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              {faq.q}
              {openFaq === i ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {openFaq === i && (
              <div className="accordion-content">{faq.a}</div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Still not sure? Watch the demo first.
        </p>
        <Link to="/demo" className="btn btn-ghost">
          Watch Demo <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
