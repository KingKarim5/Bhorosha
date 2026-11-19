import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

export interface BillTemplate {
  key: string;
  style: 'printed' | 'handwritten';
  header: string;
  sub: string;
  lines: string[];
  total: string;
  footer: string[];
}
export interface BillImageHandle {
  toBlob: () => Promise<Blob | null>;
}

// Renders a seeded placeholder bill on a canvas (Noto Sans Bengali), so the AI reader gets a real image.
export const BillImage = forwardRef<BillImageHandle, { template: BillTemplate; className?: string }>(function BillImage({ template, className }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => ({
    toBlob: () =>
      new Promise((res) => {
        const c = canvas.current;
        if (!c) return res(null);
        c.toBlob((b) => res(b), 'image/png'); // toBlob returns nothing; the callback resolves
      }),
  }));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([document.fonts.load('600 30px "Noto Sans Bengali"'), document.fonts.load('400 22px "Noto Sans Bengali"')]);
      } catch {
        /* fonts unavailable: canvas falls back */
      }
      const c = canvas.current;
      if (!c || cancelled) return;
      const W = 900;
      const H = 260 + template.lines.length * 46 + template.footer.length * 40;
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      const hand = template.style === 'handwritten';
      g.fillStyle = hand ? '#f4efe2' : '#fffdf6';
      g.fillRect(0, 0, W, H);
      // paper texture
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = `rgba(80,60,20,${Math.random() * 0.035})`;
        g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      }
      const font = (w: number, s: number) => `${w} ${s}px "Noto Sans Bengali", "Inter Variable", sans-serif`;
      g.fillStyle = '#1d2422';
      g.save();
      if (hand) g.rotate(-0.012);
      g.font = font(600, 34);
      g.textAlign = 'center';
      g.fillText(template.header, W / 2, 62);
      g.font = font(400, 20);
      g.fillStyle = '#4a514f';
      g.fillText(template.sub, W / 2, 98);
      g.strokeStyle = '#8b8f86';
      g.beginPath();
      g.moveTo(40, 120);
      g.lineTo(W - 40, 120);
      g.stroke();
      g.textAlign = 'left';
      g.fillStyle = hand ? '#22304f' : '#1d2422';
      g.font = font(400, hand ? 25 : 23);
      let yy = 165;
      for (const l of template.lines) {
        g.fillText(l, 60 + (hand ? Math.random() * 6 : 0), yy);
        yy += 46;
      }
      g.beginPath();
      g.moveTo(40, yy - 18);
      g.lineTo(W - 40, yy - 18);
      g.stroke();
      g.font = font(600, 28);
      g.fillText(template.total, 60, yy + 24);
      yy += 72;
      g.font = font(400, 20);
      g.fillStyle = '#3c4441';
      for (const l of template.footer) {
        g.fillText(l, 60, yy);
        yy += 40;
      }
      g.restore();
      if (hand) {
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(0, 0, W, H);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [template]);
  return <canvas ref={canvas} className={className} style={{ width: '100%', height: 'auto', borderRadius: 6, border: '1px solid var(--line)' }} aria-label={`${template.header}: ${template.total}`} role="img" />;
});

/** Resize an uploaded photo in the browser to about 1600 px on the long edge before upload. */
export async function resizeImage(file: File, maxEdge = 1600): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.88));
  } finally {
    URL.revokeObjectURL(url);
  }
}
