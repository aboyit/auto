import type { DeviceInfo, LogEntry, StudioAutoConfig, Point, StepPoint, BoxRegion } from './types';
import { useState, useEffect, useRef } from 'react';
import { GamePreview } from './components/GamePreview';
import { AutoPanel } from './components/AutoPanel';
import { ConsoleLog } from './components/ConsoleLog';

const API_BASE = window.location.port === '5173' || window.location.port === '4173'
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : window.location.origin;

export function App() {
  const [engineRunning, setEngineRunning] = useState(false);
  useEffect(() => {
    const syncEngineState = (event: Event) => setEngineRunning((event as CustomEvent<boolean>).detail);
    window.addEventListener('studio-engine-state', syncEngineState);
    const syncInitialEngineState = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/scenarios/engine/status`);
        if (!response.ok) return;
        const data: { is_running: boolean } = await response.json();
        setEngineRunning(data.is_running);
      } catch {
        // The engine state will synchronize when the backend becomes available.
      }
    };
    void syncInitialEngineState();
    return () => window.removeEventListener('studio-engine-state', syncEngineState);
  }, []);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedSerial, setSelectedSerial] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoConfig, setAutoConfig] = useState<StudioAutoConfig | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [pickingTarget, setPickingTarget] = useState<{
    label: string;
    onPick: (p: Point) => void;
    onPickBox?: (box: BoxRegion) => void;
    onPickSwipe?: (start: Point, end: Point) => void;
  } | null>(null);
  const [navigatingLabel, setNavigatingLabel] = useState<string | null>(null);
  const [navigatingStatus, setNavigatingStatus] = useState<string | null>(null);
  const [launchingGame, setLaunchingGame] = useState<boolean>(false);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState<boolean>(true);
  const [isStreamEnabled, setIsStreamEnabled] = useState<boolean>(false);

  const autoConfigRef = useRef<StudioAutoConfig | null>(null);
  useEffect(() => {
    autoConfigRef.current = autoConfig;
  }, [autoConfig]);

  // 1. Fetch devices voi timeout 3s
  const fetchDevices = async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${API_BASE}/api/devices`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data: DeviceInfo[] = await res.json();
        setDevices(data);
        if (data.length > 0) {
          setSelectedSerial((prev) => (prev ? prev : data[0].serial));
        }
      }
    } catch (err) {
      // ignore
    }
  };

  // 2. Fetch Auto Config voi timeout 3s
  const fetchConfig = async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${API_BASE}/api/auto/config`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        setAutoConfig(data);
      }
    } catch (err) {
      // ignore
    }
  };

  // 3. Fetch initial logs
  const fetchLogs = async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${API_BASE}/api/auto/logs`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data: LogEntry[] = await res.json();
        setLogs(data);
      }
    } catch (err) {
      // ignore
    }
  };

  const handleManualRefresh = () => {
    fetchDevices();
    fetchConfig();
    fetchLogs();
    setRefreshKey((k) => k + 1);
  };

  const handleLaunchGame = async () => {
    const targetSerial = selectedSerial || (devices.length > 0 ? devices[0].serial : '');
    setLaunchingGame(true);
    try {
      const path = targetSerial ? `${encodeURIComponent(targetSerial)}/launch-game` : 'launch-game';
      const res = await fetch(`${API_BASE}/api/devices/${path}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail?.message || data.detail || data.message || 'Không thể mở Game 3Q');
      }
      if (data.serial) setSelectedSerial(data.serial);
      handleManualRefresh();
    } catch (err) {
      alert(`Không mở được Game 3Q: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLaunchingGame(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchConfig();
    fetchLogs();

    // Tu dong lap kiem tra device va config neu chua load duoc (moi 4 giay)
    const interval = setInterval(() => {
      fetchDevices();
      if (!autoConfigRef.current) {
        fetchConfig();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // 4. WebSocket Realtime Logs voi auto-reconnect
  useEffect(() => {
    fetchLogs();
    const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/logs';
    let ws: WebSocket | null = null;
    let isSubscribed = true;
    let reconnectTimer: any = null;

    const connectLogWs = () => {
      if (!isSubscribed) return;
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const entry: LogEntry = JSON.parse(event.data);
            setLogs((prev) => {
              if (prev.some((l) => l.id === entry.id)) return prev;
              return [...prev.slice(-400), entry];
            });
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          if (isSubscribed) {
            reconnectTimer = setTimeout(connectLogWs, 1500);
          }
        };

        ws.onerror = () => {
          // se duoc handle boi onclose
        };
      } catch (e) {
        if (isSubscribed) {
          reconnectTimer = setTimeout(connectLogWs, 2000);
        }
      }
    };

    connectLogWs();

    return () => {
      isSubscribed = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [refreshKey]);

  const handleSaveConfig = async (newCfg: StudioAutoConfig) => {
    try {
      await fetch(`${API_BASE}/api/auto/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCfg),
      });
      setAutoConfig(newCfg);
    } catch (err) {
      console.error('Loi luu config:', err);
    }
  };

  const handleStartAuto = async () => {
    const targetSerial = selectedSerial || (devices.length > 0 ? devices[0].serial : '');
    if (!targetSerial) {
      alert('Chưa phát hiện thiết bị BlueStacks! Hãy bật BlueStacks và bấm Làm mới.');
      return;
    }
    if (!selectedSerial) {
      setSelectedSerial(targetSerial);
    }

    try {
      const res = await fetch(`${API_BASE}/api/auto/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: targetSerial, action: 'start' }),
      });
      if (res.ok) {
        setAutoConfig((prev) => (prev ? { ...prev, is_running: true } : prev));
      } else {
        alert('Máy chủ từ chối lệnh bắt đầu Auto');
      }
    } catch (err) {
      console.error('Loi bat auto:', err);
      alert('Không kết nối được Backend (Port 8000)! Hãy mở file run.bat để khởi động máy chủ.');
    }
  };

  const handleStopAuto = async () => {
    const targetSerial = selectedSerial || (devices.length > 0 ? devices[0].serial : '');
    try {
      const res = await fetch(`${API_BASE}/api/auto/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: targetSerial, action: 'stop' }),
      });
      if (res.ok) {
        setAutoConfig((prev) => (prev ? { ...prev, is_running: false } : prev));
      }
    } catch (err) {
      console.error('Loi dung auto:', err);
    }
  };

  const handleClearLogs = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auto/logs/clear`, { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setLogs([]);
    } catch (err) {
      console.error('Loi xoa log:', err);
    }
  };

  const handleStartPick = async (
    label: string,
    onPicked: (p: Point, box?: BoxRegion) => void,
    previousSteps?: StepPoint[],
    mode?: 'swipe'
  ) => {
    setIsStreamEnabled(true);
    const targetSerial = selectedSerial || (devices.length > 0 ? devices[0].serial : '');

    // Nếu có các bước trước đó, tự động chạy tuần tự trên game để mở đúng màn hình
    if (previousSteps && previousSteps.length > 0) {
      if (!targetSerial) {
        alert('Chưa phát hiện thiết bị BlueStacks! Hãy kết nối thiết bị trước.');
        return;
      }

      setNavigatingLabel(label);
      setNavigatingStatus(`Đang mở màn hình cho "${label}"...`);

      try {
        const res = await fetch(`${API_BASE}/api/auto/navigate-steps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serial: targetSerial,
            steps: previousSteps,
            delay_seconds: 1.5,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.warn('Lỗi điều hướng:', errData);
        }

        // Chờ 600ms để WebSocket truyền hình ảnh mới nhất từ game
        await new Promise((resolve) => setTimeout(resolve, 600));
      } catch (err) {
        console.error('Không kết nối được backend để điều hướng:', err);
      } finally {
        setNavigatingLabel(null);
        setNavigatingStatus(null);
      }
    }

    setPickingTarget({
      label,
      onPick: async (point: Point) => {
        onPicked(point);

        if (label === 'Nút Giúp Tất Cả' && targetSerial) {
          try {
            const response = await fetch(`${API_BASE}/api/auto/help/template`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serial: targetSerial,
                x: point.x,
                y: point.y,
              }),
            });
            if (!response.ok) {
              alert('Không lưu được mẫu icon. Hãy bảo đảm icon Giúp Tất Cả đang hiện rồi gắn lại.');
            }
          } catch (err) {
            alert('Không kết nối được Backend để lưu mẫu icon.');
          }
        }

        if (label.includes('Kỵ Binh đã đào tạo') && targetSerial) {
          try {
            await fetch(`${API_BASE}/api/auto/template/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serial: targetSerial,
                x: point.x,
                y: point.y,
                template_name: 'cavalry_collect.png',
              }),
            });
          } catch (err) {
            console.error('Không lưu được mẫu icon lính kỵ binh:', err);
          }
        }

        if (label.includes('Xuất Thành') && targetSerial) {
          try {
            await fetch(`${API_BASE}/api/auto/template/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serial: targetSerial,
                x: point.x,
                y: point.y,
                template_name: 'btn_xuat_thanh.png',
                radius: 34,
              }),
            });
          } catch (err) {
            console.error('Không lưu được mẫu ảnh Xuất Thành:', err);
          }
        }

        if (label.includes('Vào Thành') && targetSerial) {
          try {
            await fetch(`${API_BASE}/api/auto/template/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serial: targetSerial,
                x: point.x,
                y: point.y,
                template_name: 'btn_vao_thanh.png',
                radius: 34,
              }),
            });
          } catch (err) {
            console.error('Không lưu được mẫu ảnh Vào Thành:', err);
          }
        }

        if (label.includes('Trở Về') && targetSerial) {
          try {
            await fetch(`${API_BASE}/api/auto/template/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serial: targetSerial,
                x: point.x,
                y: point.y,
                template_name: 'btn_back.png',
                radius: 34,
              }),
            });
          } catch (err) {
            console.error('Không lưu được mẫu ảnh Trở Về:', err);
          }
        }

        if (label.includes('Đóng X') && targetSerial) {
          try {
            await fetch(`${API_BASE}/api/auto/template/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serial: targetSerial,
                x: point.x,
                y: point.y,
                template_name: 'btn_close_x.png',
                radius: 34,
              }),
            });
          } catch (err) {
            console.error('Không lưu được mẫu ảnh Đóng X:', err);
          }
        }

        if (label.includes('Tuyết') && targetSerial) {
          try {
            await fetch(`${API_BASE}/api/auto/template/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serial: targetSerial,
                x: point.x,
                y: point.y,
                template_name: 'snow_empty_area.png',
                radius: 34,
              }),
            });
          } catch (err) {
            console.error('Không lưu được mẫu ảnh vùng tuyết:', err);
          }
        }

        setPickingTarget(null);
      },
      onPickSwipe: mode === 'swipe' ? (start: Point, end: Point) => {
        onPicked(start, { x1: start.x, y1: start.y, x2: end.x, y2: end.y });
        setPickingTarget(null);
      } : undefined,
      onPickBox: async (box: BoxRegion) => {
        const centerPoint: Point = {
          x: Math.round((box.x1 + box.x2) / 2),
          y: Math.round((box.y1 + box.y2) / 2),
        };
        onPicked(centerPoint, box);
        setPickingTarget(null);
      },
    });
  };

  const handleTestClick = async (label: string, point: Point) => {
    const targetSerial = selectedSerial || (devices.length > 0 ? devices[0].serial : '');
    if (!targetSerial || point.x <= 0 || point.y <= 0) return;
    try {
      await fetch(`${API_BASE}/api/auto/test-click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: targetSerial,
          x: point.x,
          y: point.y,
          label,
        }),
      });
    } catch (err) {
      console.error('Lỗi bấm thử:', err);
    }
  };

  const handleResetCamera = async () => {
    const targetSerial = selectedSerial || (devices.length > 0 ? devices[0].serial : '');
    if (!targetSerial) return;
    try {
      await fetch(`${API_BASE}/api/auto/reset-camera`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: targetSerial }),
      });
    } catch (err) {
      console.error('Lỗi reset camera:', err);
    }
  };

  const handleCancelPick = () => {
    setPickingTarget(null);
  };

  const activeDevice = devices.find((d) => d.serial === selectedSerial) || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Top Navbar */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: '#0f172a', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 10px #38bdf8' }} />
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '0.5px' }}>
            ISOMETRIC AUTO GAME STUDIO <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 400 }}>v1.0</span>
          </h1>
        </div>

        {/* Device Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
          <label style={{ fontSize: 13, color: '#94a3b8' }}>BlueStacks Device:</label>
          <select
            value={selectedSerial}
            onChange={(e) => setSelectedSerial(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {devices.map((d) => (
              <option key={d.serial} value={d.serial}>
                {d.model} — {d.serial} {d.connected ? '(Online)' : '(Offline)'}
              </option>
            ))}
            {devices.length === 0 && <option value="">Đang tìm BlueStacks...</option>}
          </select>
          <button
            onClick={handleManualRefresh}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: '#0284c7',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Làm mới
          </button>
          {/* Nút Bật/Tắt Luồng Stream Game */}
          <button
            onClick={() => setIsStreamEnabled((prev) => !prev)}
            title={isStreamEnabled ? 'Bấm để tắt stream và thu gọn cột Game' : 'Bấm để bật stream và mở rộng cột Game'}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: isStreamEnabled ? '#065f46' : '#1e293b',
              border: isStreamEnabled ? '1px solid #10b981' : '1px solid #475569',
              color: isStreamEnabled ? '#a7f3d0' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s',
            }}
          >
            <span>{isStreamEnabled ? '🟢' : '⚪'}</span>
            <span>{isStreamEnabled ? 'Stream Game: BẬT' : 'Stream Game: TẮT'}</span>
          </button>

          <button
            onClick={handleLaunchGame}
            disabled={launchingGame}
            title="Gửi lệnh mở app Game 3Q lên màn hình BlueStacks"
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: launchingGame ? '#475569' : '#16a34a',
              color: 'white',
              border: 'none',
              cursor: launchingGame ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {launchingGame ? '⏳ Đang mở Game 3Q...' : '🎮 Mở Game 3Q'}
          </button>
          <button
            type="button"
            title={engineRunning ? 'Dừng toàn bộ kịch bản tự động' : 'Bật các kịch bản tự động đang được kích hoạt'}
            onClick={() => window.dispatchEvent(new CustomEvent(engineRunning ? 'studio-stop-engine' : 'studio-start-engine'))}
            style={{ padding: '6px 16px', background: engineRunning ? '#dc2626' : '#16a34a', color: 'white', border: 0, borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {engineRunning ? '🛑 DỪNG TOÀN BỘ' : '▶ BẬT CHẠY TỰ ĐỘNG'}
          </button>
        </div>
      </header>

      {/* Main Workspace Body: Trái là Game Preview, Phải là Kịch bản Macro (trên) và Console Log ngang (dưới) */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Cột 1 (Trái): Game Live Stream Preview - Bật/Tắt stream và thu gọn cột */}
        <div
          style={{
            width: isStreamEnabled ? 360 : 42,
            height: '100%',
            overflow: 'hidden',
            flexShrink: 0,
            borderRight: '1px solid #1e293b',
            position: 'relative',
            zIndex: 10,
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            background: '#0b1120',
          }}
        >
          {isStreamEnabled ? (
            <GamePreview
              device={activeDevice}
              apiBase={API_BASE}
              refreshKey={refreshKey}
              pickingTarget={pickingTarget}
              onCancelPick={handleCancelPick}
              navigatingStatus={navigatingStatus}
              isStreamEnabled={isStreamEnabled}
              onToggleStream={() => setIsStreamEnabled(false)}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '12px 2px',
                background: '#0b1120',
                gap: 16,
                cursor: 'pointer',
              }}
              onClick={() => setIsStreamEnabled(true)}
              title="Bấm để Bật stream và mở rộng cột Game"
            >
              <button
                type="button"
                onClick={() => setIsStreamEnabled(true)}
                style={{
                  width: 30,
                  height: 30,
                  background: '#0284c7',
                  border: '1px solid #38bdf8',
                  borderRadius: 6,
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                }}
                title="Mở rộng Game Preview"
              >
                ▶
              </button>
              <span
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  transform: 'rotate(180deg)',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#38bdf8',
                  letterSpacing: 1.5,
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                📺 MỞ STREAM GAME
              </span>
            </div>
          )}
        </div>

        {/* Cột 2 (Phải): Kịch bản Macro ở trên + Console Log nằm ngang ở dưới */}
        <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#090d16' }}>
          {/* Nửa Trên: Kịch Bản Macro Studio n8n (Rộng rãi toàn màn hình) */}
          <div style={{ flex: '1 1 65%', minHeight: 0, padding: 12, overflowY: 'auto', borderBottom: '2px solid #1e293b' }}>
            <AutoPanel
              config={autoConfig}
              onSave={handleSaveConfig}
              onStart={handleStartAuto}
              onStop={handleStopAuto}
              isRunning={autoConfig?.is_running || false}
              activePickingLabel={pickingTarget?.label}
              onStartPick={handleStartPick}
              onCancelPick={handleCancelPick}
              navigatingLabel={navigatingLabel}
              onTestClick={handleTestClick}
              onResetCamera={handleResetCamera}
              apiBase={API_BASE}
              selectedSerial={selectedSerial}
              onClearLogs={handleClearLogs}
            />
          </div>

          {/* Nửa Dưới: Realtime Console Logs dàn ngang (Có thể Ẩn/Hiện) */}
          <div
            style={{
              height: isConsoleCollapsed ? 42 : 230,
              minHeight: isConsoleCollapsed ? 42 : 160,
              maxHeight: isConsoleCollapsed ? 42 : 340,
              padding: isConsoleCollapsed ? '4px 12px' : '8px 12px 10px 12px',
              background: '#060a12',
              flexShrink: 0,
              overflow: 'hidden',
              transition: 'height 0.25s ease-in-out',
            }}
          >
            <ConsoleLog
              logs={logs}
              onClear={handleClearLogs}
              isCollapsed={isConsoleCollapsed}
              onToggleCollapse={() => setIsConsoleCollapsed((prev) => !prev)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;