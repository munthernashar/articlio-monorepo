type SkeletonProps = {
  width?: string;
  height?: string;
  className?: string;
};

/** Shimmering placeholder shape for loading states. Respects prefers-reduced-motion globally. */
export function Skeleton({ width, height, className }: SkeletonProps) {
  return <span className={`skeleton ${className ?? ''}`} style={{ width, height }} aria-hidden="true" />;
}
