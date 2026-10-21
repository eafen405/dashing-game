import { useEffect, useRef, useState } from 'react';
import { runSpike, type SpikeResult } from './spike/probe';

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<SpikeResult | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    runSpike(host).then((r) => {
      if (disposed) return;
      setResult(r);
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div className="spike">
      <div className="spike-stage" ref={hostRef} />
      <pre className="spike-report">{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}
