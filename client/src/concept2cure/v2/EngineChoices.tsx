/**
 * The engine choice — AnA's modes (registryModel ANA_MODES) — as a named radio
 * group, the current mode checked. The one implementation both pickers render
 * (Home's pill, the rail's "Control & engine" popup), each in its own look.
 *
 * Row 74, ADR-0015 §9 (WCAG 2.2 AA 4.1.2): both pickers marked the current
 * engine only with `data-on`, which no assistive technology reads. `data-on`
 * stays for the existing styles; `aria-checked` is what is announced.
 */
import { I } from './icons';
import { ANA_MODES } from './registryModel';

export function EngineChoices({
  mode,
  onChoose,
  variant = 'landing',
}: {
  mode: string;
  onChoose: (id: string) => void;
  variant?: 'landing' | 'rail';
}) {
  return (
    <div role="radiogroup" aria-label="Engine">
      {ANA_MODES.map((m) => {
        const on = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={variant === 'rail' ? 'ana-menu-item' : undefined}
            data-on={on || undefined}
            onClick={() => onChoose(m.id)}
          >
            {variant === 'rail' ? (
              <>
                <span className="ico">{I.zap}</span>
                {m.effortLabel}
                <span className="mh">{m.desc}</span>
              </>
            ) : (
              <>
                <span className="lm-label">{m.effortLabel}</span>
                <span className="lm-desc">{m.desc}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
