import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { RotateCcw, Share2, Download, Monitor, Smartphone, Check } from 'lucide-react';
import ScoreRing from '../../components/ScoreRing.jsx';
import FindingCard from '../../components/FindingCard.jsx';
import CopyButton from '../../components/CopyButton.jsx';

export default function AuditDetailPage() {
  const { auditId } = useParams();
  const [viewport, setViewport] = useState('desktop');
  const [shareToast, setShareToast] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/report/${auditId}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    } catch {}
  };

  return (
    <div className="page-container fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
        <ScoreRing score={83} size={100} label="/100" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="page-eyebrow">Audit Report</div>
          <h1 className="page-title" style={{ fontSize: 24 }}>myapp.vercel.app</h1>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-blue">Vibe Check</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mar 18, 2026</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost"><RotateCcw size={14} /> Re-run</button>
        <button className="btn btn-ghost" onClick={handleShare}><Share2 size={14} /> Share</button>
        <button className="btn btn-ghost"><Download size={14} /> Download PDF</button>
      </div>

      {shareToast && <div className="toast"><Check size={14} style={{ color: 'var(--green)' }} /> Link copied to clipboard</div>}

      {/* Screenshots */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className={viewport === 'desktop' ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setViewport('desktop')} style={{ padding: '6px 14px', fontSize: 12 }}>
            <Monitor size={14} /> Desktop
          </button>
          <button className={viewport === 'mobile' ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setViewport('mobile')} style={{ padding: '6px 14px', fontSize: 12 }}>
            <Smartphone size={14} /> Mobile
          </button>
        </div>
        <div style={{
          background: 'var(--bg-deepest)', borderRadius: 'var(--radius-md)', height: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--line)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {viewport === 'desktop' ? '1280×800' : '390×844'} screenshot
          </span>
        </div>
      </div>

      {/* Findings */}
      <div className="card-label" style={{ marginBottom: 12 }}>Findings (3)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        <FindingCard severity="critical" category="flow" title="Navigation dropdown not accessible on mobile"
          description="Hamburger menu touch events fail below 390px." fixPrompt="Add touch-action: manipulation to the nav button." />
        <FindingCard severity="warning" category="layout" title="Content overflows horizontally"
          fixPrompt="Add overflow-x: hidden to main wrapper." />
        <FindingCard severity="info" category="accessibility" title="2 form inputs missing labels" />
      </div>

      <CopyButton text="1. Fix nav dropdown\n2. Fix overflow\n3. Add form labels" label="Copy All Fix Prompts" size="lg" />
    </div>
  );
}
