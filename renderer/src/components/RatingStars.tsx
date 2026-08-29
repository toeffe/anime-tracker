import { useState } from "react";

interface Props {
  rating: number | null;
  size?: "xs" | "sm" | "lg";
  interactive?: boolean;
  onChange?: (rating: number | null) => void;
  label?: string;
}

function scoreToStars(rating: number | null): number {
  if (rating === null) return 0;
  return Math.max(0, Math.min(5, Math.round(rating / 2)));
}

function starsToScore(stars: number): number {
  return stars * 2;
}

export function RatingStars({
  rating,
  size = "sm",
  interactive = false,
  onChange,
  label,
}: Props) {
  const selected = scoreToStars(rating);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? selected;

  function pick(stars: number) {
    if (!interactive || !onChange) return;
    if (stars === selected) onChange(null);
    else onChange(starsToScore(stars));
  }

  const group = (
    <span
      className={`rating rating-${size}${interactive ? " rating-interactive" : ""}`}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown;
        if (!interactive) {
          return (
            <span key={n} className={`rating-star ${filled ? "filled" : ""}`} aria-hidden="true">
              {filled ? "★" : "☆"}
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            className={`rating-star-btn ${filled ? "filled" : ""}`}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => pick(n)}
          >
            {filled ? "★" : "☆"}
          </button>
        );
      })}
    </span>
  );

  if (!label) {
    return interactive ? (
      group
    ) : selected === 0 ? (
      <span className={`rating rating-${size} rating-empty`}>Not rated</span>
    ) : (
      group
    );
  }

  return (
    <div className="rate-row">
      <span className="rate-row-label">{label}</span>
      {group}
    </div>
  );
}
