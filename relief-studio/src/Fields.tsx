import { useEffect, useRef, useState } from 'react';

export function NumberField({
  label,
  value,
  onCommit,
  min = 0,
  max = 256,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onCommit(value: number): void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const canceled = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    if (canceled.current) {
      canceled.current = false;
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    if (
      draft.trim() &&
      Number.isFinite(parsed) &&
      parsed >= min &&
      parsed <= max &&
      (step !== 1 || Number.isInteger(parsed))
    ) {
      if (parsed !== value) onCommit(parsed);
    } else setDraft(String(value));
  }
  return (
    <input
      aria-label={label}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          canceled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}
export function NameField({
  value,
  onCommit,
  disabled,
}: {
  value: string;
  onCommit(value: string): void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      aria-label="区域名称"
      value={draft}
      maxLength={100}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft.trim() && draft !== value) onCommit(draft.trim());
        else setDraft(value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
