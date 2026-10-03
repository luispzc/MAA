import { useEffect, useState } from 'react';

/** Escala para que un lienzo de width x height quepa entero en la ventana. */
export function useFitScale(width: number, height: number): number {
  const compute = () => Math.min(window.innerWidth / width, window.innerHeight / height);
  const [scale, setScale] = useState(compute);
  useEffect(() => {
    const onResize = () => setScale(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [width, height]);
  return scale;
}
