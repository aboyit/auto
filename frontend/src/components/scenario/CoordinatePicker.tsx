import { useEffect, useRef, useState } from 'react';
import type { Point } from '../../types';

interface Props {
  apiBase: string;
  serial: string;
  onSave: (point: Point) => void;
  onClose: () => void;
}

export function CoordinatePicker({ apiBase, serial, onSave, onClose }: Props) {
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [point, setPoint] = useState<Point | null>(null);
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    async function capture() {
      try {
        if (!serial) throw new Error('Chưa chọn thiết bị.');
        const response = await fetch(`${apiBase}/api/devices/${encodeURIComponent(serial)}/frame`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Không chụp được ảnh (HTTP ${response.status}).`);
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setSource(url);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void capture();
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [apiBase, serial]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 25000, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <section role="dialog" aria-modal="true" aria-label="Chọn tọa độ trên ảnh" style={{ background: '#0f172a', color: '#e2e8f0', padding: 16, border: '1px solid #475569', borderRadius: 10, maxHeight: '95vh', maxWidth: '95vw', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 8px' }}>Chọn tọa độ trên ảnh chụp</h3>
        <p style={{ fontSize: 12 }}>Đưa camera về trung tâm trước khi chọn. Click chỉ chọn điểm, không gửi lệnh vào game.</p>
        {error ? <p role="alert">{error}</p> : !source ? <p>Đang chụp ảnh...</p> : (
          <div style={{ position: 'relative', width: 'fit-content', lineHeight: 0 }}>
            <img ref={image} src={source} alt="Ảnh gốc để chọn tọa độ" draggable={false}
              onLoad={e => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              onError={() => setError('Không đọc được ảnh thiết bị.')}
              onClick={e => {
                const img = image.current;
                if (!img || !size.width) return;
                const rect = img.getBoundingClientRect();
                setPoint({ x: Math.max(0, Math.min(size.width - 1, Math.floor((e.clientX - rect.left) * size.width / rect.width))), y: Math.max(0, Math.min(size.height - 1, Math.floor((e.clientY - rect.top) * size.height / rect.height))) });
              }}
              style={{ display: 'block', maxHeight: '60vh', maxWidth: '85vw', width: 'auto', height: 'auto', cursor: 'crosshair' }} />
            {point && size.width > 0 && <span style={{ position: 'absolute', pointerEvents: 'none', left: `${(point.x + .5) / size.width * 100}%`, top: `${(point.y + .5) / size.height * 100}%`, width: 16, height: 16, border: '2px solid #f87171', borderRadius: '50%', transform: 'translate(-50%, -50%)', boxShadow: '0 0 0 1px #fff' }} />}
          </div>
        )}
        <p aria-live="polite">Ảnh: {size.width} × {size.height} px · {point ? `X: ${point.x}, Y: ${point.y}` : 'Chưa chọn điểm'}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={onClose}>Hủy</button>
          <button type="button" disabled={!point || Boolean(error)} onClick={() => { if (point) onSave(point); }}>Lưu tọa độ</button>
        </div>
      </section>
    </div>
  );
}
