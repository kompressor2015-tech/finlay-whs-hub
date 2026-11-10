import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

/**
 * Sign with a finger, stylus or mouse. Calls onChange with a PNG file once something is drawn,
 * or null when cleared. Works on phones (touch scrolling is turned off inside the box).
 */
export function SignaturePad({ onChange, label = 'Signature' }: { onChange: (file: File | null) => void; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Size the drawing surface to the box and the screen's pixel density, so lines stay sharp.
  const setup = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1F2328';
    setEmpty(true);
    onChange(null);
  }, [onChange]);

  useEffect(() => {
    setup();
  }, []);

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext('2d');
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#1F2328';
      ctx.fill();
    }
  }

  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    canvasRef.current?.toBlob(blob => {
      if (blob) onChange(new File([blob], 'signature.png', { type: 'image/png' }));
    }, 'image/png');
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-medium">{label}</span>
        <button type="button" onClick={setup} disabled={empty} className="bg-transparent border-0 text-sm font-semibold text-finlay cursor-pointer min-h-10 disabled:text-muted disabled:cursor-default">
          Clear
        </button>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={empty ? 'Signature box: sign here with your finger or mouse' : 'Your signature'}
          className="w-full h-40 bg-white border border-[#D6D2CC] rounded-xl cursor-crosshair touch-none block"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {empty && <span className="absolute inset-0 flex items-center justify-center text-muted text-sm pointer-events-none">Sign here</span>}
        <span className="absolute left-4 right-4 bottom-8 border-b border-dashed border-[#D6D2CC] pointer-events-none" aria-hidden="true" />
      </div>
    </div>
  );
}
