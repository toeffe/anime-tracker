interface Props {
  label: string;
}

export function Spinner({ label }: Props) {
  return (
    <div className="spinner-block" role="status" aria-live="polite" aria-label={label}>
      <div className="spinner" aria-hidden="true" />
      <p className="dim">{label}</p>
    </div>
  );
}
