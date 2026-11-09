import { useMemo, useRef, useState } from 'react';

// Type-to-search product chooser. Matches SKU, name, category, material, size.
export default function ProductPicker({ products, value, onChange, placeholder = 'Search SKU or name…', autoFocus }) {
  const selected = products.find((p) => p.id === value);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef(null);

  const matches = useMemo(() => {
    const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return products.slice(0, 30);
    return products
      .filter((p) => {
        const hay = `${p.sku} ${p.name} ${p.category} ${p.material || ''} ${p.diameterMm || ''} ${p.capacityKg || ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 30);
  }, [products, text]);

  const pick = (p) => { onChange(p.id, p); setText(''); setOpen(false); };

  return (
    <div className="picker" ref={box} onBlur={(e) => !box.current.contains(e.relatedTarget) && setOpen(false)}>
      <input
        autoFocus={autoFocus}
        value={open ? text : selected ? `${selected.sku} — ${selected.name}` : text}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setText(''); setHi(0); }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter' && open && matches[hi]) { e.preventDefault(); pick(matches[hi]); }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <div className="picker-list" role="listbox">
          {matches.length === 0 && <div className="picker-empty">No product matches “{text}”</div>}
          {matches.map((p, i) => (
            <button
              type="button"
              key={p.id}
              className={`picker-item ${i === hi ? 'hi' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
            >
              <b>{p.sku}</b> <span>{p.name}</span>
              {p.trackSerial && <small className="badge">Serial</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
