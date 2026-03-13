import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DemoPage as DemoExperience } from '../../App.jsx';

export default function DemoPage() {
  const [report, setReport] = useState(null);

  return (
    <>
      <DemoExperience report={report} onReportReady={setReport} />

      {report && (
        <div style={{
          margin: '0 auto 32px',
          maxWidth: 720,
          padding: '14px 20px',
          borderRadius: 10,
          border: '1px solid rgba(59,180,255,0.2)',
          background: 'rgba(59,180,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(232,244,255,0.9)', marginBottom: 3 }}>
              Want more runs?
            </div>
            <div style={{ fontSize: 12, color: 'rgba(142,168,199,0.7)' }}>
              Free plan is limited to 5 demo runs/day and 10 tests per run.
            </div>
          </div>
          <Link
            to="/pricing"
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(59,180,255,0.35)',
              background: 'rgba(59,180,255,0.08)',
              color: '#3bb4ff',
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            See pricing →
          </Link>
        </div>
      )}
    </>
  );
}