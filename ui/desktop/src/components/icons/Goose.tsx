import asliLogo from '../../images/icon.png';

export function Goose({ className = '' }: { className?: string }) {
  return (
    <img
      src={asliLogo}
      alt="Houshiar Code"
      className={`inline-block object-contain ${className}`.trim()}
    />
  );
}

export function Rain(_props: { className?: string } = {}) {
  return null;
}
