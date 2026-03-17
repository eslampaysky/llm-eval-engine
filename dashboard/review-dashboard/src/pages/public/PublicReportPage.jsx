import ScoreRing from '../../components/ScoreRing.jsx';
import FindingCard from '../../components/FindingCard.jsx';

export default function PublicReportPage() {
  return (
    <div className="fade-in" style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '48px 40px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
        <ScoreRing score={83} size={100} label="/100" />
        <div>
          <div className="page-eyebrow">Public Report</div>
          <h1 className="page-title" style={{ fontSize: 24 }}>myapp.vercel.app</h1>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <span className="badge badge-blue">Vibe Check</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mar 18, 2026</span>
          </div>
        </div>
      </div>

      <div className="card-label" style={{ marginBottom: 12 }}>Findings (3)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <FindingCard severity="critical" category="flow" title="Navigation dropdown not accessible on mobile"
          description="Hamburger menu fails below 390px." fixPrompt="Add touch-action: manipulation" />
        <FindingCard severity="warning" category="layout" title="Content overflows horizontally"
          fixPrompt="Add overflow-x: hidden" />
        <FindingCard severity="info" category="accessibility" title="2 form inputs missing labels" />
      </div>

      <div style={{ textAlign: 'center', marginTop: 48, padding: '32px 0', borderTop: '1px solid var(--line)' }}>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Want to audit your own app?
        </p>
        <a href="/auth/signup" className="btn btn-primary">Get Started Free</a>
      </div>
    </div>
  );
}
