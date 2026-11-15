import { AlertCircle } from 'lucide-react';

/** Red message right under a field. Say exactly what to fix ("Enter the selling price, e.g. 499"), never "invalid". */
export default function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-red-600">
      <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export const errRing = (msg) => (msg ? ' !border-red-500 !ring-2 !ring-red-500/30' : '');
