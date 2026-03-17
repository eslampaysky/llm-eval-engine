import { useState } from 'react';
import { Link } from 'react-router-dom';

const TIERS = [
  {
    key: 'vibe',
    name: 'Vibe Check',
    price: '$0',
    period: 'Free forever',
    desc: 'For solo builders who want a quick sanity check.',
    highlight: false,
    features: [
      'Desktop + mobile screenshots',
      'Top 3 bugs by severity',
      'Fix prompts you can paste',
      '3 audits per month',
      'Community support',
    ],
    cta: 'Get Started Free',
    ctaTo: '/app/vibe-check',
  },
  {
    key: 'deep',
    name: 'Deep Dive',
    price: '$29',
    period: '/month',
    desc: 'For teams that need full visibility before launch.',
    highlight: true,
    badge: 'MOST POPULAR',
    features: [
      'Everything in Vibe Check',
      'Full Playwright crawl',
      'User journey testing',
      'Video replay of every session',
      'All findings (not just top 3)',
      '50 audits per month',
      'Share links for stakeholders',
    ],
    cta: 'Start 7-Day Free Trial',
    ctaTo: '/auth/signup',
  },
  {
    key: 'fix',
    name: 'Fix & Verify',
    price: '$99',
    period: '/month or $1/resolution',
    desc: 'For teams that want bugs fixed, not just found.',
    highlight: false,
    features: [
      'Everything in Deep Dive',
      'AI code-level analysis',
      'Bundled fix prompt (all issues)',
      'Re-verification after fix',
      'Unlimited audits',
      'Priority support',
      'API access',
    ],
    cta: 'Start Free Trial',
    ctaTo: '/auth/signup',
  },
];

const FAQ = [
  {
    q: 'How does AiBreaker find bugs?',
    a: 'We launch a real Chromium browser via Playwright, crawl your app like a user would, capture desktop and mobile screenshots, log console errors and failed network requests, then send everything to Gemini AI for visual bug detection. The whole process takes 30–90 seconds.',
  },
  {
    q: 'Do I need to give you access to my codebase?',
    a: 'No. AiBreaker only needs a publicly accessible URL. We test from the outside, exactly like your users do. No code access, no SDKs, no integration required.',
  },
  {
    q: 'What does a "fix prompt" look like?',
    a: 'It\'s a plain-English instruction you can paste directly into Lovable, Bolt.new, Replit Agent, or Cursor. For example: "The sign-up button on mobile (390px viewport) is hidden behind the footer. Move the CTA above the fold and add 16px bottom margin."',
  },
  {
    q: 'Can I test apps behind a login?',
    a: 'Not yet in the self-serve product. The Deep Dive and Fix & Verify tiers support user journey steps (click, fill, submit) that can navigate through login flows. Contact us for early access to authenticated testing.',
  },
  {
    q: 'What\'s the refund policy?',
    a: 'If AiBreaker doesn\'t find a single real bug in your app, we\'ll refund your first month — no questions asked. We\'re confident because 67% of AI-built apps have issues we catch.',
  },
];

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '56px 20px 80px' }}>

      {/* ═══ Header ═══ */}
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: '.72rem', color: '#3bb4ff',
          letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10,
        }}>
          // pricing
        </div>
        <h1 style={{
          fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 800, margin: '0 0 14px',
          lineHeight: 1.1,
        }}>
          Simple pricing. No surprises.
        </h1>
        <p style={{ color: '#8ea8c7', fontSize: '1rem', margin: 0, maxWidth: 500, marginInline: 'auto' }}>
          Start free. Upgrade when you need deeper analysis, video replay, or code-level fix prompts.
        </p>
      </div>

      {/* ═══ Pricing Cards ═══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 18, marginBottom: 56,
      }}>
        {TIERS.map((t) => (
          <div key={t.key} style={{
            background: 'linear-gradient(165deg, var(--panel), var(--panel-2))',
            border: t.highlight ? '1px solid rgba(59,180,255,.5)' : '1px solid var(--line)',
            borderRadius: 16, padding: '32px 24px',
            display: 'flex', flexDirection: 'column', gap: 18,
            position: 'relative', overflow: 'hidden',
            boxShadow: t.highlight ? '0 0 2rem rgba(59,180,255,.08)' : 'none',
          }}>
            {/* Badge */}
            {t.badge && (
              <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                background: 'linear-gradient(120deg, var(--accent), var(--accent2))',
                color: '#020810', fontSize: '.66rem', fontWeight: 800,
                letterSpacing: '.08em', padding: '4px 16px',
                borderRadius: '0 0 8px 8px',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {t.badge}
              </div>
            )}

            {/* Plan info */}
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 700 }}>{t.name}</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '10px 0 6px' }}>
                <span style={{
                  fontSize: '2.4rem', fontWeight: 800,
                  background: 'linear-gradient(135deg, var(--text), var(--accent))',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>{t.price}</span>
                <span style={{
                  fontSize: '.82rem', color: '#8ea8c7',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{t.period}</span>
              </div>
              <p style={{ margin: 0, fontSize: '.85rem', color: '#8ea8c7' }}>{t.desc}</p>
            </div>

            {/* Features */}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {t.features.map((f) => (
                <li key={f} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  fontSize: '.85rem', color: '#8ea8c7',
                }}>
                  <span style={{ color: '#26f0b9', flexShrink: 0, marginTop: 1 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Link to={t.ctaTo} style={{
              display: 'block', textAlign: 'center', textDecoration: 'none',
              marginTop: 'auto', borderRadius: 12, padding: '13px 20px',
              fontWeight: 700, fontSize: '.85rem',
              fontFamily: "'JetBrains Mono', monospace",
              transition: 'transform .15s, box-shadow .2s',
              ...(t.highlight
                ? {
                    background: 'linear-gradient(120deg, var(--accent), var(--accent2))',
                    color: '#020810',
                    boxShadow: 'var(--glow-blue), var(--glow-green)',
                  }
                : {
                    background: 'transparent',
                    border: '1px solid #25537a',
                    color: '#9fd5ff',
                  }),
            }}
            onMouseEnter={(e) => { e.target.style.transform = 'scale(1.03)'; }}
            onMouseLeave={(e) => { e.target.style.transform = 'scale(1)'; }}
            >
              {t.cta}
            </Link>
          </div>
        ))}
      </div>

      {/* ═══ FAQ ═══ */}
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: '.72rem', color: '#26f0b9',
          letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10, textAlign: 'center',
        }}>
          FAQ
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 28px', textAlign: 'center' }}>
          Frequently asked questions
        </h2>

        <div style={{ display: 'grid', gap: 8 }}>
          {FAQ.map((item, i) => (
            <div key={i} style={{
              background: 'linear-gradient(165deg, var(--panel), var(--panel-2))',
              border: '1px solid var(--line)', borderRadius: 12,
              overflow: 'hidden', transition: 'border-color .2s',
              borderColor: openFaq === i ? 'rgba(59,180,255,.35)' : undefined,
            }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{
                width: '100%', padding: '16px 18px',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                color: 'var(--text)', fontSize: '.92rem', fontWeight: 600, textAlign: 'left',
                fontFamily: 'inherit',
              }}>
                {item.q}
                <span style={{
                  color: '#8ea8c7', transition: 'transform .2s',
                  transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0)',
                }}>▼</span>
              </button>
              {openFaq === i && (
                <div style={{
                  padding: '0 18px 16px', fontSize: '.88rem',
                  color: '#8ea8c7', lineHeight: 1.6,
                }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Bottom CTA ═══ */}
      <div style={{
        marginTop: 48, padding: '28px 24px', textAlign: 'center',
        background: 'linear-gradient(165deg, var(--panel), var(--panel-2))',
        border: '1px solid var(--line)', borderRadius: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Not sure which tier fits?</div>
          <div style={{ fontSize: '.85rem', color: '#8ea8c7' }}>Start with a free Vibe Check — upgrade anytime.</div>
        </div>
        <Link to="/app/vibe-check" style={{
          textDecoration: 'none',
          background: 'linear-gradient(120deg, var(--accent), var(--accent2))',
          color: '#020810', borderRadius: 10, padding: '12px 28px',
          fontWeight: 700, fontSize: '.85rem',
          fontFamily: "'JetBrains Mono', monospace",
          boxShadow: 'var(--glow-blue)',
          transition: 'transform .15s',
        }}
        onMouseEnter={(e) => { e.target.style.transform = 'scale(1.03)'; }}
        onMouseLeave={(e) => { e.target.style.transform = 'scale(1)'; }}
        >
          Start Free →
        </Link>
      </div>
    </div>
  );
}
