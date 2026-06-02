import { useRef, useState } from 'react';

interface Props {
  onSave: (dataUrl: string) => void;
  onSkip: () => void;
}

export default function SignatureCanvas({ onSave, onSkip }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
    setHasStrokes(true);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#004B93';
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => setDrawing(false);

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const save = () => {
    const dataUrl = canvasRef.current!.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#004B93]">Customer Signature</h2>
        <p className="text-sm text-gray-500">Please sign below to confirm work is complete.</p>

        <canvas
          ref={canvasRef}
          width={400}
          height={180}
          className="w-full border-2 border-gray-200 rounded-xl touch-none bg-gray-50"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />

        <div className="flex gap-3">
          <button onClick={clear} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold">
            Clear
          </button>
          <button onClick={onSkip} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold">
            Skip
          </button>
          <button
            onClick={save}
            disabled={!hasStrokes}
            className="flex-1 py-3 rounded-xl bg-[#004B93] text-white font-semibold disabled:opacity-40"
          >
            Save ✅
          </button>
        </div>
      </div>
    </div>
  );
}