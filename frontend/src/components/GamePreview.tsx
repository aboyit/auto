import type { DeviceInfo, FrameMetadata, Point, BoxRegion } from '../types';
import { useRef, useState, useEffect, useCallback } from 'react';

interface GamePreviewProps {
  device: DeviceInfo | null;
  apiBase: string;
  refreshKey?: number;
  pickingTarget?: {
    label: string;
    onPick: (p: Point) => void;
    onPickBox?: (box: BoxRegion) => void;
    onPickSwipe?: (start: Point, end: Point) => void;
  } | null;
  onCancelPick?: () => void;
  navigatingStatus?: string | null;
  isStreamEnabled?: boolean;
  onToggleStream?: () => void;
}

export const GamePreview: React.FC<GamePreviewProps> = ({
  device,
  apiBase,
  refreshKey,
  pickingTarget,
  onCancelPick,
  navigatingStatus,
  isStreamEnabled = false,
  onToggleStream,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<FrameMetadata | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [cropBoxStart, setCropBoxStart] = useState<{ clientX: number; clientY: number; devX: number; devY: number } | null>(null);
  const [cropBoxCurrent, setCropBoxCurrent] = useState<{ clientX: number; clientY: number; devX: number; devY: number } | null>(null);
  const [isSelectingBox, setIsSelectingBox] = useState<boolean>(false);

  const fpsCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());

  // Lắng nghe phím ESC để hủy chế độ chọn tọa độ
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pickingTarget && onCancelPick) {
        onCancelPick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pickingTarget, onCancelPick]);

  useEffect(() => {
    if (!device || !device.connected || !isStreamEnabled) {
      setIsConnected(false);
      setFps(0);
      return;
    }

    let isSubscribed = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let oldBlobUrl: string | null = null;

    const connectWs = () => {
      if (!isSubscribed) return;
      try {
        const encodedSerial = encodeURIComponent(device.serial);
        const wsUrl = apiBase.replace(/^http/, 'ws') + `/ws/devices/${encodedSerial}/frames`;
        ws = new WebSocket(wsUrl);
        ws.binaryType = 'blob';

        ws.onopen = () => {
          if (!isSubscribed) return;
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          if (!isSubscribed) return;

          if (event.data instanceof Blob) {
            const url = URL.createObjectURL(event.data);
            setFrameUrl(url);

            // Giai phong Blob cu sau khi anh moi da duoc gan
            if (oldBlobUrl) {
              URL.revokeObjectURL(oldBlobUrl);
            }
            oldBlobUrl = url;

            fpsCountRef.current++;
            const now = Date.now();
            if (now - lastFpsTimeRef.current >= 1000) {
              setFps(fpsCountRef.current);
              fpsCountRef.current = 0;
              lastFpsTimeRef.current = now;
            }
          } else if (typeof event.data === 'string') {
            try {
              const parsed = JSON.parse(event.data);
              if (!parsed.error) {
                setMeta(parsed);
              }
            } catch {
              // ignore
            }
          }
        };

        ws.onerror = () => {
          setIsConnected(false);
        };

        ws.onclose = () => {
          setIsConnected(false);
          if (isSubscribed) {
            reconnectTimer = setTimeout(connectWs, 1500);
          }
        };
      } catch (e) {
        setIsConnected(false);
        if (isSubscribed) {
          reconnectTimer = setTimeout(connectWs, 2000);
        }
      }
    };

    connectWs();

    return () => {
      isSubscribed = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }
      if (oldBlobUrl) {
        URL.revokeObjectURL(oldBlobUrl);
      }
    };
  }, [device?.serial, device?.connected, apiBase, refreshKey, isStreamEnabled]);

  const getDeviceCoords = useCallback((e: React.MouseEvent<HTMLImageElement>): { x: number; y: number } | null => {
    const img = imageRef.current;
    if (!img) return null;

    const rect = img.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (clickX < 0 || clickY < 0 || clickX > rect.width || clickY > rect.height) {
      return null;
    }

    const nativeW = meta?.width || device?.width || 720;
    const nativeH = meta?.height || device?.height || 1280;

    const scaleX = nativeW / rect.width;
    const scaleY = nativeH / rect.height;

    const devX = Math.round(clickX * scaleX);
    const devY = Math.round(clickY * scaleY);

    return {
      x: Math.max(0, Math.min(nativeW, devX)),
      y: Math.max(0, Math.min(nativeH, devY)),
    };
  }, [meta, device]);

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const coords = getDeviceCoords(e);
    setHoverCoords(coords);
    if (isSelectingBox && coords) {
      setCropBoxCurrent({ clientX: e.clientX, clientY: e.clientY, devX: coords.x, devY: coords.y });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    const coords = getDeviceCoords(e);
    if (pickingTarget) {
      if (coords) {
        setCropBoxStart({ clientX: e.clientX, clientY: e.clientY, devX: coords.x, devY: coords.y });
        setCropBoxCurrent({ clientX: e.clientX, clientY: e.clientY, devX: coords.x, devY: coords.y });
        setIsSelectingBox(true);
      }
      return;
    }
    if (coords) setDragStart(coords);
  };

  const handleMouseUp = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (pickingTarget) {
      if (isSelectingBox && cropBoxStart) {
        setIsSelectingBox(false);
        const endCoords = getDeviceCoords(e) || { x: cropBoxStart.devX, y: cropBoxStart.devY };
        const dist = Math.hypot(endCoords.x - cropBoxStart.devX, endCoords.y - cropBoxStart.devY);

        if (pickingTarget.onPickSwipe) {
          if (dist >= 10) {
            pickingTarget.onPickSwipe({ x: cropBoxStart.devX, y: cropBoxStart.devY }, endCoords);
            setCopiedText('Đã chọn hướng vuốt.');
          } else {
            setCopiedText('Hãy kéo từ điểm bắt đầu đến điểm kết thúc.');
          }
        } else if (dist >= 10 && pickingTarget.onPickBox) {
          const x1 = Math.min(cropBoxStart.devX, endCoords.x);
          const y1 = Math.min(cropBoxStart.devY, endCoords.y);
          const x2 = Math.max(cropBoxStart.devX, endCoords.x);
          const y2 = Math.max(cropBoxStart.devY, endCoords.y);
          pickingTarget.onPickBox({ x1, y1, x2, y2 });
          setCopiedText(`✂️ Đã khoanh vùng cắt: (${x1}, ${y1}) ➔ (${x2}, ${y2}) [${x2 - x1}x${y2 - y1}px]`);
        } else {
          pickingTarget.onPick({ x: cropBoxStart.devX, y: cropBoxStart.devY });
          setCopiedText(`🎯 Đã chọn điểm: (${cropBoxStart.devX}, ${cropBoxStart.devY})`);
        }
        setCropBoxStart(null);
        setCropBoxCurrent(null);
        setTimeout(() => setCopiedText(null), 3000);
      }
      return;
    }
    if (!dragStart || !device) return;
    const endCoords = getDeviceCoords(e);
    const start = dragStart;
    setDragStart(null);

    if (!endCoords) return;

    // Sao chép tọa độ vào clipboard để tiện dán vào config
    const coordStr = `X: ${endCoords.x}, Y: ${endCoords.y}`;
    navigator.clipboard?.writeText(`${endCoords.x}, ${endCoords.y}`).catch(() => {});
    setCopiedText(`Đã chép: ${coordStr}`);
    setTimeout(() => setCopiedText(null), 2500);

    const dist = Math.hypot(endCoords.x - start.x, endCoords.y - start.y);

    if (dist < 15) {
      try {
        await fetch(`${apiBase}/api/devices/${device.serial}/tap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: start.x, y: start.y }),
        });
      } catch (err) {
        // ignore
      }
    } else {
      try {
        await fetch(`${apiBase}/api/devices/${device.serial}/swipe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            x1: start.x,
            y1: start.y,
            x2: endCoords.x,
            y2: endCoords.y,
            duration_ms: 350,
          }),
        });
      } catch (err) {
        // ignore
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0b1120', color: '#f8fafc', padding: 10 }}>
      {/* Thanh trạng thái cố định (Chiều cao cố định 38px - KHÔNG BAO GIỜ làm giật/nhảy map game) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 38,
          minHeight: 38,
          marginBottom: 6,
          padding: '0 10px',
          background: pickingTarget ? '#451a03' : '#1e293b',
          border: pickingTarget ? '1px solid #d97706' : '1px solid #334155',
          borderRadius: 6,
          fontSize: 12,
          boxSizing: 'border-box',
          transition: 'background 0.2s',
        }}
      >
        {/* Phía bên trái thanh trạng thái */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          {navigatingStatus ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', fontWeight: 600 }}>
              <div style={{ width: 10, height: 10, border: '2px solid #38bdf8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{navigatingStatus}</span>
            </div>
          ) : pickingTarget ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fde68a', fontWeight: 700, minWidth: 0 }}>
              <span title={pickingTarget.label} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🎯 <u>{pickingTarget.label}</u></span>
            </div>
          ) : (
            <span style={{ color: isConnected && fps > 0 ? '#4ade80' : '#f59e0b' }}>
              Stream: <strong>{isConnected ? `${fps} FPS` : 'Đang kết nối...'}</strong>
            </span>
          )}
        </div>

        {/* Phía bên phải thanh trạng thái */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ color: pickingTarget ? '#fde68a' : '#fbbf24', fontWeight: 700 }}>
            {hoverCoords ? `(${hoverCoords.x}, ${hoverCoords.y})` : 'Di chuột xem tọa độ'}
          </span>

          {pickingTarget && onCancelPick && (
            <button
              onClick={onCancelPick}
              style={{
                background: '#b45309',
                border: '1px solid #fef08a',
                color: 'white',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Hủy gán vị trí (hoặc nhấn phím ESC)"
            >
              Hủy
            </button>
          )}

          {onToggleStream && !pickingTarget && (
            <button
              onClick={onToggleStream}
              style={{
                background: '#1e293b',
                border: '1px solid #475569',
                color: '#94a3b8',
                borderRadius: 4,
                padding: '2px 7px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Tắt stream và thu gọn cột Game để mở rộng khu vực kịch bản"
            >
              ◀ Thu gọn
            </button>
          )}
        </div>
      </div>

      {/* Khung chứa stream game (Kích thước ổn định tuyệt đối) */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#020617',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid #1e293b',
        }}
      >
        {copiedText && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              background: 'rgba(2, 132, 199, 0.9)',
              color: 'white',
              textAlign: 'center',
              fontSize: 11,
              padding: '4px 12px',
              borderRadius: 20,
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              zIndex: 30,
              pointerEvents: 'none',
            }}
          >
            {copiedText}
          </div>
        )}

        {/* Khung khoanh vùng chữ nhật trực quan khi kéo chuột cắt ảnh */}
        {isSelectingBox && cropBoxStart && cropBoxCurrent && containerRef.current && (() => {
          const containerRect = containerRef.current.getBoundingClientRect();
          const left = Math.min(cropBoxStart.clientX, cropBoxCurrent.clientX) - containerRect.left;
          const top = Math.min(cropBoxStart.clientY, cropBoxCurrent.clientY) - containerRect.top;
          const width = Math.abs(cropBoxCurrent.clientX - cropBoxStart.clientX);
          const height = Math.abs(cropBoxCurrent.clientY - cropBoxStart.clientY);
          const devW = Math.abs(cropBoxCurrent.devX - cropBoxStart.devX);
          const devH = Math.abs(cropBoxCurrent.devY - cropBoxStart.devY);

          return (
            <div
              style={{
                position: 'absolute',
                left,
                top,
                width,
                height,
                border: '2px dashed #f59e0b',
                background: 'rgba(245, 158, 11, 0.25)',
                pointerEvents: 'none',
                zIndex: 40,
                boxShadow: '0 0 12px rgba(245, 158, 11, 0.6)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: top > 25 ? -22 : height + 4,
                  left: 0,
                  background: '#78350f',
                  color: '#fef08a',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  border: '1px solid #f59e0b',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
                }}
              >
                📐 {devW} × {devH} px
              </div>
            </div>
          );
        })()}

        {frameUrl ? (
          <img
            ref={imageRef}
            src={frameUrl}
            alt="Live Game Stream"
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            draggable={false}
            style={{
              maxHeight: '100%',
              maxWidth: '100%',
              objectFit: 'contain',
              cursor: 'crosshair',
              userSelect: 'none',
            }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13, padding: 20, textAlign: 'center' }}>
            <div style={{ width: 24, height: 24, border: '3px solid #334155', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span>Đang nạp màn hình BlueStacks...</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>Đảm bảo BlueStacks 3Q đang mở (Port 5555)</span>
          </div>
        )}
      </div>
    </div>
  );
};