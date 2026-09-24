import "./Spinner.css";

export function Spinner({ size = 15 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size, borderWidth: Math.max(1.5, size / 9) }} aria-hidden="true" />;
}

export function LoadingRow({ label = "Loading" }: { label?: string }) {
  return (
    <div className="loading-row">
      <Spinner />
      <span>{label}…</span>
    </div>
  );
}
