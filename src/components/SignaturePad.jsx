import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * SignaturePad — Canvas-based signature drawing component
 * iOS-style touch/mouse drawing with clear button.
 * Returns base64 PNG image via onChange callback.
 */
export default function SignaturePad({ onChange, width = 320, height = 180 }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const lastPoint = useRef(null);

  // Resize canvas to match display size (retina support)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
  }, [width, height]);

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }, []);

  const startDraw = useCallback((e) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    lastPoint.current = pos;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  }, [getPos]);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && lastPoint.current) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPoint.current = pos;
    if (!hasSignature) setHasSignature(true);
  }, [isDrawing, getPos, hasSignature]);

  const endDraw = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPoint.current = null;
    // Export signature as base64
    const canvas = canvasRef.current;
    if (canvas && hasSignature && onChange) {
      onChange(canvas.toDataURL('image/png'));
    }
  }, [isDrawing, hasSignature, onChange]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSignature(false);
    lastPoint.current = null;
    if (onChange) onChange(null);
  }, [onChange]);

  // Prevent scroll while drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevent = (e) => { if (isDrawing) e.preventDefault(); };
    canvas.addEventListener('touchmove', prevent, { passive: false });
    return () => canvas.removeEventListener('touchmove', prevent);
  }, [isDrawing]);

  return (
    <div className="relative">
      {/* Canvas container */}
      <div className="relative bg-white rounded-2xl border-2 border-dashed border-gray-300 overflow-hidden">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${height}px`, touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {/* Signature line */}
        <div className="absolute bottom-8 left-6 right-6 border-b border-gray-300" />
        <div className="absolute bottom-2.5 left-6 text-[11px] text-gray-400">
          Unterschrift
        </div>
        {/* Placeholder text when empty */}
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-gray-300 text-sm">Hier unterschreiben</span>
          </div>
        )}
      </div>

      {/* Clear button */}
      {hasSignature && (
        <button
          type="button"
          onClick={clear}
          className="absolute top-2 right-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded-lg transition-colors"
        >
          Löschen
        </button>
      )}
    </div>
  );
}
