export default function PricingPage() {
  return (
    <section className="page fade-in" style={{ maxWidth: 980, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-eyebrow">// public · pricing</div>
        <div className="page-title">Pricing</div>
        <div className="page-desc">Placeholder pricing page for the SaaS architecture migration.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        {['Starter', 'Growth', 'Enterprise'].map((plan) => (
          <div key={plan} className="card">
            <div className="card-label">{plan}</div>
            <div style={{ fontSize: 28, color: 'var(--hi)', marginBottom: 8 }}>TBD</div>
            <div style={{ color: 'var(--mid)' }}>Plan details will be filled in later. The route and layout are now ready.</div>
          </div>
        ))}
      </div>
    </section>
  );
}
