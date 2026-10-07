/* Champs de formulaire contrôlés avec étiquette associée (mêmes classes CSS que le prototype). */
import { useId, type InputHTMLAttributes } from 'react';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: string; value: string; onChange: (v: string) => void;
};
export function TextField({ label, value, onChange, ...rest }: InputProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={e => onChange(e.target.value)} {...rest} />
    </div>
  );
}

export type Option = string | { value: string; label: string };
export function SelectField({ label, value, onChange, options, required, disabled }: {
  label: string; value: string; onChange: (v: string) => void; options: Option[]; required?: boolean; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} required={required} disabled={disabled} onChange={e => onChange(e.target.value)}>
        {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
