import { useState } from 'react';

export default function CopyButton({ text, label = '📋 Copy Fix Prompt' }) {
  const [copied, setCopied] = useState(false);

  if (!text) return null;

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={handleCopy}>
      {copied ? '✓ Copied!' : label}
    </button>
  );
}
