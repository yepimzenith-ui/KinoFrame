import React, { useEffect, useRef } from 'react';
import { HistogramData } from '../utils/renderEngine';

interface HistogramProps {
  data: HistogramData | null;
}

export const Histogram: React.FC<HistogramProps> = ({ data }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle grid guides
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = (w / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const drawChannel = (values: number[], fill: string, stroke: string) => {
      const bins = values.length;
      if (bins < 2) return;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < bins; i++) {
        const x = (i / (bins - 1)) * w;
        const y = h - values[i] * (h - 6);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < bins; i++) {
        const x = (i / (bins - 1)) * w;
        const y = h - values[i] * (h - 6);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };

    ctx.globalCompositeOperation = 'screen';
    drawChannel(data.r, 'rgba(239, 68, 68, 0.25)', 'rgba(239, 68, 68, 0.75)');
    drawChannel(data.g, 'rgba(34, 197, 94, 0.25)', 'rgba(34, 197, 94, 0.75)');
    drawChannel(data.b, 'rgba(59, 130, 246, 0.25)', 'rgba(59, 130, 246, 0.75)');
    ctx.globalCompositeOperation = 'source-over';
    drawChannel(data.luma, 'rgba(255, 255, 255, 0.08)', 'rgba(244, 244, 245, 0.65)');
  }, [data]);

  return (
    <div className="px-4 pt-3 pb-3 border-b border-zinc-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-400">RGB Histogram</span>
        <span className="text-[11px] font-mono text-zinc-500 tabular-nums">Luma · R · G · B</span>
      </div>
      <div className="rounded-md bg-zinc-900 border border-zinc-800/80 overflow-hidden h-20">
        <canvas ref={canvasRef} width={272} height={80} className="w-full h-full block" />
      </div>
    </div>
  );
};
