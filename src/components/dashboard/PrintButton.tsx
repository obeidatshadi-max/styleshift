'use client'

// Triggers the browser's native print dialog (Print → Save as PDF). Hidden on
// the printed page itself via the report's @media print rules.
export default function PrintButton({ label }: { label: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="no-print"
      style={{
        background: '#0a7ea4', color: '#fff', border: 'none', borderRadius: 8,
        padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
