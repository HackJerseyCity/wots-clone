type Props = { size?: number; className?: string };

// Octagonal "stop sign" mark. Inline SVG (not an <img>) so it inherits
// currentColor if we ever want to restyle it and doesn't cost a request.
export default function BrandMark({ size = 22, className = '' }: Props) {
  return (
    <span
      aria-hidden
      className={`inline-block bg-brand ${className}`}
      style={{
        width: size,
        height: size,
        clipPath:
          'polygon(29.3% 0, 70.7% 0, 100% 29.3%, 100% 70.7%, 70.7% 100%, 29.3% 100%, 0 70.7%, 0 29.3%)',
      }}
    />
  );
}
