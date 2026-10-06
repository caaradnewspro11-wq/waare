export default function HeroArt() {
  const doc = (x, c, t) => (<g transform={`translate(${x},40)`}><rect width="90" height="116" rx="10" fill="#fff" stroke={c} strokeWidth="3" /><rect width="90" height="30" rx="10" fill={c} /><text x="45" y="21" textAnchor="middle" fill="#fff" fontWeight="700" fontSize="15">{t}</text>
    {[52, 66, 80, 94].map((y) => <rect key={y} x="14" y={y} width={y % 28 ? 62 : 44} height="5" rx="2.5" fill="#d6deeb" />)}</g>);
  return (
    <svg viewBox="0 0 520 190" className="heroart" role="img" aria-label="Word, PDF and Excel documents converting into each other">
      {doc(10, '#2b579a', 'DOCX')}{doc(215, '#d32f2f', 'PDF')}{doc(420, '#1d6f42', 'XLSX')}
      {[[108, 'M0 0h95'], [313, 'M0 0h95']].map(([x, d]) => <g key={x} transform={`translate(${x},98)`}><path d={d} stroke="#0b2a5b" strokeWidth="3" strokeDasharray="7 6" fill="none"><animate attributeName="stroke-dashoffset" from="26" to="0" dur="1.2s" repeatCount="indefinite" /></path><path d="M95 -7l10 7-10 7z" fill="#0b2a5b" /></g>)}
    </svg>
  );
}
