import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const [url, setUrl] = useState('');
  const navigate = useNavigate();

  function handleCTA() {
    if (url.trim()) {
      navigate(`/auth/signup?url=${encodeURIComponent(url.trim())}`);
    } else {
      navigate('/auth/signup');
    }
  }

  return (
    <div style={{ overflow: 'hidden' }}>

      {/* ═══════ HERO ═══════ */}
      <section style={{
        maxWidth: 900, margin: '0 auto', textAlign: 'center',
        paddingTop: 80, paddingBottom: 60, position: 'relative',
      }}>
        {/* Glow backdrop */}
        <div style={{
          position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)',
          width: 700, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,180,255,.12) 0%, rgba(38,240,185,.06) 40%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: '.76rem', color: '#9fd5ff',
            letterSpacing: '.06em', marginBottom: 20, opacity: .8,
          }}>
            // reliability layer for the AI-built web
          </div>

          <h1 style={{
            fontSize: 'clamp(2.2rem, 5.5vw, 3.6rem)', fontWeight: 800,
            lineHeight: 1.08, margin: '0 0 22px',
            background: 'linear-gradient(135deg, #e8f4ff 30%, var(--accent) 60%, var(--accent2) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Your AI built it.<br />We make sure it works.
          </h1>

          <p style={{
            maxWidth: 640, margin: '0 auto 32px', fontSize: '1.05rem', lineHeight: 1.6,
            color: '#8ea8c7',
          }}>
            Lovable, Bolt, and Replit ship fast. But 67% of AI-built apps have broken flows users hit on day one.
            AiBreaker finds them in 60 seconds — before your customers do.
          </p>

          {/* URL input bar */}
          <div style={{
            display: 'flex', gap: 10, maxWidth: 560, margin: '0 auto 16px',
            background: 'rgba(12,18,32,.85)', border: '1px solid #25537a',
            borderRadius: 14, padding: 6, alignItems: 'center',
          }}>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCTA()}
              placeholder="https://your-app.com"
              style={{
                flex: 1, background: 'transparent', border: 'none', color: 'var(--text)',
                padding: '12px 14px', fontSize: '.95rem', outline: 'none',
              }}
            />
            <button onClick={handleCTA} style={{
              background: 'linear-gradient(120deg, var(--accent), var(--accent2))',
              color: '#020810', border: 'none', borderRadius: 10,
              padding: '12px 24px', fontWeight: 700, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", fontSize: '.85rem',
              boxShadow: 'var(--glow-blue), var(--glow-green)',
              transition: 'transform .15s, box-shadow .25s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { e.target.style.transform = 'scale(1.04)'; }}
            onMouseLeave={(e) => { e.target.style.transform = 'scale(1)'; }}
            >
              Run a Free Vibe Check →
            </button>
          </div>

          <p style={{
            fontSize: '.78rem', color: '#5a7d9e', margin: 0,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            No sign-up required · Works on any public URL · Free forever
          </p>
        </div>
      </section>

      {/* ═══════ SOCIAL PROOF ═══════ */}
      <div style={{
        textAlign: 'center', padding: '22px 0', borderTop: '1px solid rgba(33,57,90,.4)',
        borderBottom: '1px solid rgba(33,57,90,.4)',
        background: 'rgba(5,7,13,.6)',
      }}>
        <p style={{
          margin: 0, fontSize: '.78rem', color: '#5a7d9e', letterSpacing: '.03em',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          Trusted by founders building on&nbsp;
          {['Lovable', 'Bolt.new', 'Replit', 'v0', 'Cursor'].map((b, i) => (
            <span key={b}>
              <span style={{ color: '#9fd5ff', fontWeight: 600 }}>{b}</span>
              {i < 4 && <span style={{ color: '#3b5775' }}> · </span>}
            </span>
          ))}
        </p>
      </div>

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: '.72rem', color: '#3bb4ff',
          letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10,
        }}>How it works</div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 36px' }}>
          Three steps. Sixty seconds.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[
            { num: '01', title: 'Paste your URL', desc: 'Drop any publicly accessible URL into the box.' },
            { num: '02', title: 'Our agent breaks it', desc: 'Playwright crawls every flow, screenshots desktop + mobile, catches console errors.' },
            { num: '03', title: 'You get the fix', desc: 'Gemini AI gives you a bug list with copy-paste fix prompts for your AI builder.' },
          ].map((s) => (
            <div key={s.num} style={{
              background: 'linear-gradient(165deg, var(--panel), var(--panel-2))',
              border: '1px solid var(--line)', borderRadius: 14, padding: '24px 20px',
              textAlign: 'left',
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: '1.8rem',
                fontWeight: 800, color: 'rgba(59,180,255,.25)', marginBottom: 10,
              }}>{s.num}</div>
              <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 700 }}>{s.title}</h3>
              <p style={{ margin: 0, fontSize: '.88rem', color: '#8ea8c7', lineHeight: 1.5 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ FEATURE CARDS (3 TIERS) ═══════ */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 64px' }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: '.72rem', color: '#26f0b9',
          letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10, textAlign: 'center',
        }}>What you get</div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 32px', textAlign: 'center' }}>
          Three tiers. Pick what fits.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          {[
            {
              icon: '⚡', title: 'Vibe Check', time: '~30 seconds',
              desc: 'Visual scan of desktop + mobile. Top 3 bugs with severity. Fix prompts you can paste into your AI builder.',
              color: '#3bb4ff',
            },
            {
              icon: '🔍', title: 'Deep Dive', time: '~60 seconds',
              desc: 'Full Playwright crawl with user journey testing. Video replay of every interaction. All findings, not just top 3.',
              color: '#26f0b9',
            },
            {
              icon: '🔧', title: 'Fix & Verify', time: '~90 seconds',
              desc: 'Everything in Deep Dive plus AI code analysis. Bundled fix prompt for all issues. Re-verification after you fix.',
              color: '#ffd24d',
            },
          ].map((f) => (
            <div key={f.title} style={{
              background: 'linear-gradient(165deg, var(--panel), var(--panel-2))',
              border: `1px solid ${f.color}30`, borderRadius: 14, padding: '28px 22px',
              transition: 'border-color .3s, box-shadow .3s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${f.color}70`; e.currentTarget.style.boxShadow = `inset 0 0 2rem ${f.color}10`; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${f.color}30`; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 700 }}>{f.title}</h3>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: '.72rem',
                color: f.color, marginBottom: 12,
              }}>{f.time}</div>
              <p style={{ margin: 0, fontSize: '.88rem', color: '#8ea8c7', lineHeight: 1.55 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ PAIN SECTION ═══════ */}
      <section style={{
        maxWidth: 700, margin: '0 auto', padding: '64px 20px', textAlign: 'center',
      }}>
        <h2 style={{
          fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, margin: '0 0 18px', lineHeight: 1.15,
          background: 'linear-gradient(135deg, #ff4d6d, #ffd24d)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          AI writes perfect-looking code<br />that silently breaks.
        </h2>
        <p style={{ color: '#8ea8c7', fontSize: '1rem', lineHeight: 1.7, maxWidth: 580, margin: '0 auto' }}>
          The checkout form submits but loses the cart. The sign-up flow looks fine on desktop but the button
          is off-screen on mobile. The API returns 200 but the data is wrong. You wouldn't know until a
          real user hits it — or until AiBreaker catches it first.
        </p>
      </section>

      {/* ═══════ FINAL CTA ═══════ */}
      <section style={{
        maxWidth: 700, margin: '0 auto', padding: '40px 20px 80px', textAlign: 'center',
      }}>
        <div style={{
          background: 'linear-gradient(165deg, var(--panel), var(--panel-2))',
          border: '1px solid var(--line)', borderRadius: 18, padding: '48px 32px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,180,255,.1), transparent)',
            pointerEvents: 'none',
          }} />
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 12px', position: 'relative' }}>
            Stop losing customers to bugs<br />you didn't know existed.
          </h2>
          <p style={{ color: '#8ea8c7', margin: '0 0 28px', fontSize: '.92rem', position: 'relative' }}>
            Every broken flow is a churned user. Start catching them in 60 seconds.
          </p>
          <Link to="/auth/signup" style={{
            display: 'inline-block', textDecoration: 'none',
            background: 'linear-gradient(120deg, var(--accent), var(--accent2))',
            color: '#020810', borderRadius: 12, padding: '14px 36px',
            fontWeight: 700, fontSize: '.92rem',
            fontFamily: "'JetBrains Mono', monospace",
            boxShadow: 'var(--glow-blue), var(--glow-green)',
            transition: 'transform .15s',
            position: 'relative',
          }}
          onMouseEnter={(e) => { e.target.style.transform = 'scale(1.04)'; }}
          onMouseLeave={(e) => { e.target.style.transform = 'scale(1)'; }}
          >
            Run a Free Vibe Check →
          </Link>
          <div style={{
            marginTop: 16, fontSize: '.76rem', color: '#5a7d9e',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            100% free · No credit card · Instant results
          </div>
        </div>
      </section>
    </div>
  );
}
