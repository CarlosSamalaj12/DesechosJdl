// src/shared/CheckboxMultiSelect.jsx — selector múltiple con checkboxes
// Genérico: sirve para áreas, categorías, etc. Cada opción lleva id, name y color.
import { useEffect, useState, useRef } from 'react';
import { Layers, CheckCheck, X } from 'lucide-react';

export default function CheckboxMultiSelect({
  options = [],
  selected,
  onChange,
  allLabel = 'Todos',
  icon: Icon = Layers,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const selectedNames = options.filter((o) => selected.includes(o.id)).map((o) => o.name);
  const label = selected.length === 0
    ? allLabel
    : selectedNames.slice(0, 2).join(', ') + (selectedNames.length > 2 ? ` +${selectedNames.length - 2}` : '');

  return (
    <div className="multi-select" ref={ref}>
      <button
        type="button"
        className={`multi-select-btn${selected.length ? ' has-value' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon size={13} />
        <span className="multi-select-label">{label}</span>
      </button>
      {open && (
        <div className="multi-select-menu">
          <div className="multi-select-actions">
            <button
              type="button"
              className="multi-select-action all"
              onClick={() => onChange(options.map((o) => o.id))}
            >
              <CheckCheck size={13} /> Todas
            </button>
            <button
              type="button"
              className="multi-select-action clear"
              onClick={() => onChange([])}
            >
              <X size={13} /> Limpiar
            </button>
          </div>
          {options.length === 0 && <div className="multi-select-empty">Cargando…</div>}
          {options.map((o) => (
            <label key={o.id} className="multi-select-opt">
              <input
                type="checkbox"
                checked={selected.includes(o.id)}
                onChange={() => toggle(o.id)}
              />
              <span className="dot" style={{ background: o.color }} />
              {o.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
