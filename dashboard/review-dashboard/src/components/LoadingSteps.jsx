import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

export default function LoadingSteps({ steps = [], currentStep = 0, done = false }) {
  return (
    <div style={{
      background: 'var(--bg-raised)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      padding: '28px 32px',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {steps.map((step, i) => {
          const isActive = !done && i === currentStep;
          const isDone = done || i < currentStep;
          const isPending = !isDone && !isActive;

          return (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              position: 'relative',
              padding: '12px 0',
            }}>
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div style={{
                  position: 'absolute',
                  left: 15,
                  top: 36,
                  bottom: -12,
                  width: 1,
                  background: isDone ? 'var(--green)' : 'var(--line)',
                  transition: 'background 0.3s',
                }} />
              )}

              {/* Icon circle */}
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 14,
                border: isDone
                  ? '1px solid rgba(52, 211, 153, 0.4)'
                  : isActive
                  ? '1px solid rgba(59, 180, 255, 0.5)'
                  : '1px solid var(--line)',
                background: isDone
                  ? 'rgba(52, 211, 153, 0.1)'
                  : isActive
                  ? 'rgba(59, 180, 255, 0.08)'
                  : 'var(--bg-surface)',
                color: isDone
                  ? 'var(--green)'
                  : isActive
                  ? 'var(--accent)'
                  : 'var(--text-dim)',
                transition: 'all 0.3s',
                animation: isActive ? 'pulseGlow 1.5s ease-in-out infinite' : 'none',
                position: 'relative',
                zIndex: 1,
              }}>
                {isDone ? <Check size={14} /> : step.icon || (i + 1)}
              </div>

              {/* Label */}
              <div style={{ paddingTop: 4 }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: isDone || isActive ? 500 : 400,
                  color: isDone || isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'color 0.3s',
                }}>
                  {step.label}
                </div>
                {isActive && (
                  <div style={{
                    fontSize: 12,
                    color: 'var(--accent)',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <span style={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      animation: 'pulseDot 1s ease-in-out infinite',
                    }} />
                    Processing...
                  </div>
                )}
                {isDone && (
                  <div style={{
                    fontSize: 12,
                    color: 'var(--green)',
                    marginTop: 2,
                  }}>
                    Complete
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
