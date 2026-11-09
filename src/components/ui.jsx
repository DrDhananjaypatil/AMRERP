import { useEffect } from 'react';

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function FieldInput({ field, value, onChange, disabled }) {
  const id = `f-${field.key}`;
  const common = { id, disabled, onChange: (e) => onChange(field.type === 'checkbox' ? e.target.checked : e.target.value) };

  let input;
  if (field.type === 'select') {
    const opts = (field.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
    input = (
      <select {...common} value={value ?? ''}>
        <option value="">— Select —</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (field.type === 'checkbox') {
    input = (
      <label className="check">
        <input type="checkbox" {...common} checked={!!value} /> <span>{field.label}</span>
      </label>
    );
  } else if (field.type === 'textarea') {
    input = <textarea {...common} rows={2} value={value ?? ''} />;
  } else {
    input = (
      <input
        {...common}
        type={field.type === 'number' ? 'number' : 'text'}
        inputMode={field.type === 'number' ? 'decimal' : undefined}
        step="any"
        value={value ?? ''}
      />
    );
  }

  return (
    <div className={`field ${field.full ? 'field-full' : ''}`}>
      {field.type !== 'checkbox' && (
        <label htmlFor={id}>
          {field.label}{field.required && <span className="req"> *</span>}
        </label>
      )}
      {input}
      {field.help && <small className="help">{field.help}</small>}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="error-note">{String(error.message || error)}</div>;
}
