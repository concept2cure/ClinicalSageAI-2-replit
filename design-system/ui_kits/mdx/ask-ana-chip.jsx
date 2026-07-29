(() => {
/**
 * AskAnA inline chip — ported from surfaces/AskAnaChip.tsx.
 * Globals set: window.AskAnaChip
 */
const { I } = window;

function AskAnaChip({ onAsk, label = 'Ask AnA', className = '' }) {
  const fire = (e) => { e.stopPropagation(); onAsk && onAsk(); };
  return (
    <span
      className={`ask-ana-chip ${className}`}
      role="button"
      tabIndex={0}
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(e); }
      }}
      title={label}
      aria-label={label}
    >
      <span className="ico">{I.sparkles}</span>
    </span>
  );
}

window.AskAnaChip = AskAnaChip;

})();
