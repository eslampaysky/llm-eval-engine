import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, ArrowRight, Zap, Loader, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { api } from '../../services/api';
import ScoreRing from '../../components/ScoreRing.jsx';

const TIER_COLORS = { vibe: 'badge-blue', deep: 'badge-amber', fix: 'badge-green' };

export default function AuditsPage() {
  const { t, i18n } = useTranslation();
  const [audits, setAudits] = useState([]);
  const [failurePatterns, setFailurePatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const tierLabels = useMemo(
    () => ({
      vibe: t('audit.list.tierLabels.vibe', 'Vibe'),
      deep: t('audit.list.tierLabels.deep', 'Deep'),
      fix: t('audit.list.tierLabels.fix', 'Fix'),
    }),
    [t],
  );

  useEffect(() => {
    (async () => {
      try {
        const [historyData, patternsData] = await Promise.all([
          api.getAgenticQAHistory(),
          api.getAgenticQAFailurePatterns(),
        ]);
        setAudits(Array.isArray(historyData) ? historyData : []);
        setFailurePatterns(Array.isArray(patternsData) ? patternsData : []);
      } catch (err) {
        console.error('Failed to load audits:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = audits.filter((audit) => (audit.url || '').toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) {
    return (
      <div className="page-container fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">{t('audit.list.eyebrow', 'History')}</div>
        <h1 className="page-title">{t('audit.list.title', 'Audits')}</h1>
        <p className="page-subtitle">{t('audit.list.subtitle', 'All your audit results in one place.')}</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input
            className="form-input"
            placeholder={t('audit.list.searchPlaceholder', 'Search by URL...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingInlineStart: 36 }}
          />
        </div>
      </div>

      {failurePatterns.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <div className="card-label">{t('audit.list.realUserBacklog', 'Real-User Backlog')}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {t('audit.list.backlogSubtitle', 'Top recurring failed steps grouped by app type and failure type.')}
              </div>
            </div>
            <span className="badge badge-amber">{t('audit.list.liveTuningLoop', 'Live tuning loop')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {failurePatterns.map((pattern) => (
              <div
                key={`${pattern.app_type}-${pattern.failure_type}-${pattern.step_name}`}
                style={{
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  padding: 14,
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span className="badge badge-blue">{pattern.app_type || 'generic'}</span>
                  <span style={{ padding: '4px 8px', borderRadius: 'var(--radius-full)', background: 'rgba(255,107,107,0.12)', color: 'var(--red)', fontSize: 11, fontWeight: 700 }}>
                    {t('audit.list.countBadge', { count: pattern.count })}
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {String(pattern.step_name || 'unknown_step').replace(/[_-]+/g, ' ')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                  <AlertTriangle size={14} style={{ color: 'var(--amber)' }} />
                  {String(pattern.failure_type || 'unknown_failure').replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t('audit.list.lastSeen', {
                    date: pattern.last_seen_at ? new Date(pattern.last_seen_at).toLocaleDateString(i18n.language === 'ar' ? 'ar' : undefined) : t('audit.list.recently', 'recently'),
                  })}
                </div>
                {pattern.example_audit_id && (
                  <Link to={`/app/audits/${pattern.example_audit_id}`} className="btn btn-ghost" style={{ width: 'fit-content', padding: '6px 10px', fontSize: 12 }}>
                    {t('audit.list.exampleAudit', 'Example audit')} <ArrowUpRight size={14} style={{ transform: i18n.dir() === 'rtl' ? 'scaleX(-1)' : undefined }} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('audit.list.table.url', 'URL')}</th>
                <th>{t('audit.list.table.tier', 'Tier')}</th>
                <th>{t('audit.list.table.score', 'Score')}</th>
                <th>{t('audit.list.table.createdAt', 'Date')}</th>
                <th>{t('audit.list.table.findings', 'Findings')}</th>
                <th>{t('audit.list.table.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((audit) => {
                const score = audit.score ?? 0;
                const tier = audit.tier || 'vibe';
                const findingsCount = audit.findings_count ?? (audit.findings ? audit.findings.length : 0);
                const id = audit.audit_id || audit.report_id;
                return (
                  <tr key={id} style={{ cursor: 'pointer' }}>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          color: 'var(--text-primary)',
                          maxWidth: 200,
                          display: 'inline-block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={audit.url}
                      >
                        {audit.url || t('common.unknown', 'Unknown')}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${TIER_COLORS[tier] || 'badge-blue'}`}>
                        {tierLabels[tier] || tier}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ScoreRing score={score} size={28} strokeWidth={3} showScore={false} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                          {score}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {audit.created_at ? new Date(audit.created_at).toLocaleDateString(i18n.language === 'ar' ? 'ar' : undefined) : '-'}
                    </td>
                    <td>{findingsCount}</td>
                    <td>
                      <Link to={`/app/audits/${id}`} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>
                        {t('common.view', 'View')}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>?</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            {searchQuery ? t('audit.list.noResultsTitle', 'No results found') : t('audit.list.emptyTitle', 'No audits yet')}
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {searchQuery ? t('audit.list.noResultsSubtitle', 'Try a different search term.') : t('audit.list.emptySubtitle', 'Run your first audit to see results here.')}
          </p>
          {!searchQuery && (
            <Link to="/app/vibe-check" className="btn btn-primary">
              <Zap size={16} /> {t('audit.list.firstAudit', 'Run Your First Audit')} <ArrowRight size={16} style={{ transform: i18n.dir() === 'rtl' ? 'scaleX(-1)' : undefined }} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
