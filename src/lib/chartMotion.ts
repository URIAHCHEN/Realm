import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
const reducedMotion = () => typeof window === 'undefined' || window.matchMedia(query).matches;

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useChartMotion(disabled = false) {
  const reduced = useSyncExternalStore(subscribe, reducedMotion, () => true);
  return {
    isAnimationActive: !reduced && !disabled,
    animationDuration: 280,
    animationBegin: 0,
    animationEasing: 'ease-out' as const,
  };
}
