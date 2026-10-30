import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Point, StepPoint, BoxRegion } from '../../types';
import type { Scenario, ScenarioStep, ActionType } from '../../types/scenario';
import { ACTION_GROUPS, ActionDropdown } from './ActionDropdown';
import { CoordinatePicker } from './CoordinatePicker';
import { computeOptimalLayout } from './graphAutoLayout';
import { routeConnections, connectionKey } from './graphRouting';

interface ScenarioManagerProps {
  apiBase: string;
  selectedSerial: string;
  activePickingLabel?: string | null;
  onStartPick: (label: string, onPicked: (p: Point, box?: BoxRegion) => void, previousSteps?: StepPoint[]) => void;
  onCancelPick: () => void;
  onTestClick?: (label: string, point: Point) => void;
  onToggleEngine?: () => void;
  engineRunning?: boolean;
}

export const ScenarioManager: React.FC<ScenarioManagerProps> = ({
  apiBase,
  selectedSerial,
  activePickingLabel,
  onStartPick,
  onCancelPick,
  onTestClick: _onTestClick,
  onToggleEngine: onToggleEngineProp,
  engineRunning,
}) => {
  const [coordinateStepId, setCoordinateStepId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [isRunningEngine, setIsRunningEngine] = useState<boolean>(false);
  const isRunningEngineRef = useRef(false);
  const engineToggleRef = useRef<(desiredState?: boolean) => Promise<void>>(async () => {});
  const [runningScenarioId, setRunningScenarioId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isProgressPopupOpen, setIsProgressPopupOpen] = useState<boolean>(false);
  const [isProgressMinimized, setIsProgressMinimized] = useState(false);
  const [testingStepId, setTestingStepId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);
  const [isToastFading, setIsToastFading] = useState<boolean>(false);
  const [refreshImgKey, setRefreshImgKey] = useState<number>(Date.now());
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<{ name: string; size: number }[]>([]);
  const [viewMode, setViewMode] = useState<'n8n' | 'list'>('n8n');
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [openLibraryStepId, setOpenLibraryStepId] = useState<string | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const dragMoveDistance = useRef<number>(0);
  const dragStartMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartNodePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Thu phóng sơ đồ (Zoom In / Out)
  const [canvasZoom, setCanvasZoom] = useState<number>(1.0);
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number } | null>(null);
  const canvasContextMenuRef = useRef<{ x: number; y: number } | null>(null);
  const canvasContextMenuElementRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<{ pointerX: number; pointerY: number; scrollLeft: number; scrollTop: number } | null>(null);

  // Kéo thả mũi tên nối thủ công (Manual Arrow Drag & Drop Connection)
  const [connectingFrom, setConnectingFrom] = useState<{ stepId: string; branch: 'default' | 'true' | 'false' } | null>(null);
  const connectingFromId = connectingFrom ? connectingFrom.stepId : null;
  const connectingBranch = connectingFrom ? connectingFrom.branch : 'default';
  const [connectingMousePos, setConnectingMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasInnerRef = useRef<HTMLDivElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePanMove = (event: MouseEvent) => {
      const pan = panStateRef.current;
      const viewport = canvasViewportRef.current;
      if (!pan || !viewport) return;
      viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.pointerX);
      viewport.scrollTop = pan.scrollTop - (event.clientY - pan.pointerY);
    };
    const handlePanEnd = () => {
      if (!panStateRef.current) return;
      panStateRef.current = null;
      if (canvasViewportRef.current) canvasViewportRef.current.style.cursor = '';
    };
    window.addEventListener('mousemove', handlePanMove);
    window.addEventListener('mouseup', handlePanEnd);
    return () => {
      window.removeEventListener('mousemove', handlePanMove);
      window.removeEventListener('mouseup', handlePanEnd);
    };
  }, []);

  // Trạng thái theo dõi tiến trình chạy thời gian thực (Realtime Progress Tracker)
  const [execState, setExecState] = useState<{
    is_running: boolean;
    history?: { step_name: string; step_type?: string; cycle?: number; success: boolean; detail?: string; time: string; duration_sec?: number; branch_name?: string }[];
    current_run_steps?: any[];
    scenario_id: string;
    scenario_name: string;
    current_cycle: number;
    total_cycles: number;
    current_step_id: string;
    current_step_name: string;
    current_rep: number;
    total_reps: number;
    status: string;
    active_step_ids?: string[];
    active_scenario_ids?: string[];
    call_stack?: any[];
    active_connection?: {
      from_id: string;
      to_id: string;
      branch: string;
    } | null;
    last_report?: any;
  } | null>(null);

  // Báo cáo thống kê kết quả chạy thử (Execution Summary Report)
  const [executionReport, setExecutionReport] = useState<any | null>(null);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const prevIsRunningRef = useRef<boolean>(false);

  // Xóa ảnh mẫu khỏi thư viện trên máy chủ
  const handleDeleteTemplateFile = async (e: React.MouseEvent, tplName: string) => {
    e.stopPropagation();
    if (!confirm(`Bạn có chắc muốn xóa ảnh '${tplName}' khỏi thư viện máy chủ?`)) return;
    try {
      const res = await fetch(`${apiBase}/api/auto/template/${tplName}`, { method: 'DELETE' });
      if (res.ok) {
        loadTemplatesList();
      }
    } catch (err) {
      alert('Lỗi xóa ảnh: ' + String(err));
    }
  };

  // Tải danh sách ảnh mẫu từ Backend
  const loadTemplatesList = async () => {
    try {
      const res = await fetch(`${apiBase}/api/auto/template/list`);
      if (res.ok) {
        const data = await res.json();
        setAvailableTemplates(data);
      }
    } catch {
      // ignore
    }
  };

  // Load danh sách kịch bản từ Backend
  const loadScenarios = async () => {
    try {
      const res = await fetch(`${apiBase}/api/scenarios`);
      if (res.ok) {
        const data: Scenario[] = await res.json();
        setScenarios(data);
        if (data.length > 0 && !selectedId) {
          setSelectedId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Lỗi tải kịch bản:', e);
    }
  };

  // Check Engine status & Execution Progress
  const checkEngineStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/api/scenarios/engine/status`);
      if (res.ok) {
        const data = await res.json();
        isRunningEngineRef.current = data.is_running;
        setIsRunningEngine(data.is_running);
        window.dispatchEvent(new CustomEvent('studio-engine-state', { detail: data.is_running }));
      }
    } catch {
      // ignore
    }
  };

  const checkExecutionProgress = async () => {
    try {
      const res = await fetch(`${apiBase}/api/scenarios/execution/status`);
      if (res.ok) {
        const data = await res.json();
        setExecState(data);
        if (data.is_running) setIsProgressPopupOpen(true);

        if (data.last_report) {
          setExecutionReport(data.last_report);
        }

        // Tự động bật modal Báo Cáo khi kịch bản vừa chạy xong
        if (prevIsRunningRef.current && !data.is_running && data.last_report) {
          setShowReportModal(true);
        }
        prevIsRunningRef.current = Boolean(data.is_running);
      }
    } catch {
      // ignore
    }
  };

  // Mở modal xem báo cáo thống kê chạy thử mới nhất
  const handleOpenReportModal = async () => {
    try {
      const res = await fetch(`${apiBase}/api/scenarios/execution/report`);
      if (res.ok) {
        const data = await res.json();
        if (data.report) {
          setExecutionReport(data.report);
          setShowReportModal(true);
        } else {
          alert('Chưa có dữ liệu chạy thử nào. Hãy nhấn "CHẠY THỬ KỊCH BẢN" trước!');
        }
      }
    } catch (e) {
      alert('Lỗi lấy báo cáo kịch bản: ' + String(e));
    }
  };

  useEffect(() => {
    loadScenarios();
    loadTemplatesList();
    checkEngineStatus();
    checkExecutionProgress();
    const timer = setInterval(() => {
      checkEngineStatus();
      checkExecutionProgress();
    }, 500);
    return () => clearInterval(timer);
  }, [apiBase]);

  const activeScenario = scenarios.find((s) => s.id === selectedId) || null;

  // Toast góc phải dưới: tự động mờ dần và ẩn hoàn toàn sau 2 giây
  useEffect(() => {
    if (!saveFeedback) {
      setIsToastFading(false);
      return;
    }

    setIsToastFading(false);

    // Sau 1.5s bắt đầu mờ dần (fade out trong 0.5s)
    const fadeTimer = setTimeout(() => {
      setIsToastFading(true);
    }, 1500);

    // Đến đúng 2.0s thì ẩn hoàn toàn
    const hideTimer = setTimeout(() => {
      setSaveFeedback(null);
      setIsToastFading(false);
    }, 2000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [saveFeedback]);

  // Lưu toàn bộ kịch bản về backend
  const handleSaveAll = async (updatedList = scenarios) => {
    setIsSaving(true);
    setSaveFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedList),
      });
      if (res.ok) {
        setScenarios(updatedList);
        const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setSaveFeedback({
          type: 'success',
          title: 'Lưu Kịch Bản Thành Công!',
          message: `Đã lưu toàn bộ quy trình an toàn lúc ${timeStr}`,
        });
      } else {
        const errorText = await res.text().catch(() => res.statusText);
        setSaveFeedback({
          type: 'error',
          title: 'Lưu Kịch Bản Thất Bại!',
          message: `Lỗi ${res.status}: ${errorText || 'Không thể lưu kịch bản'}`,
        });
      }
    } catch (e) {
      setSaveFeedback({
        type: 'error',
        title: 'Lỗi Kết Nối Máy Chủ!',
        message: String(e),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Cập nhật kịch bản hiện tại
  const updateActiveScenario = (updater: (prev: Scenario) => Scenario) => {
    if (!activeScenario) return;
    const updated = updater({ ...activeScenario });
    const newList = scenarios.map((s) => (s.id === updated.id ? updated : s));
    setScenarios(newList);
  };

  // Thêm kịch bản mới
  const handleAddScenario = () => {
    const newId = 'sc_' + Date.now().toString(36);
    const newSc: Scenario = {
      id: newId,
      name: 'Kịch bản mới ' + (scenarios.length + 1),
      description: 'Mô tả kịch bản',
      enabled: true,
      interval_minutes: 0,
      loop_count: 1,
      loop_delay: 0.5,
      steps: [],
    };
    const newList = [...scenarios, newSc];
    setScenarios(newList);
    setSelectedId(newId);
    handleSaveAll(newList);
  };

  // Xóa kịch bản
  const handleDeleteScenario = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa kịch bản này?')) {
      const newList = scenarios.filter((s) => s.id !== id);
      setScenarios(newList);
      if (selectedId === id && newList.length > 0) {
        setSelectedId(newList[0].id);
      }
      handleSaveAll(newList);
    }
  };

  // Thêm một bước hành động vào kịch bản đang chọn
  const handleAddStep = (type: ActionType, position?: { x: number; y: number }) => {
    if (!activeScenario) return;

    const newStep: ScenarioStep = {
      id: 'step_' + Date.now().toString(36),
      type,
      name: 'Bước mới',
      enabled: true,
      repeat_count: 1,
      repeat_delay: 0.5,
      ...(position ? { node_x: position.x, node_y: position.y } : {}),
    };

    if (type === 'if_template') {
      newStep.name = '❓ Kiểm Tra Ảnh (If/Else)';
      newStep.templates = [];
      newStep.threshold = 0.72;
      newStep.fallback_point = { x: 0, y: 0 };
    } else if (type === 'click_matched') {
      newStep.name = '👆 Bấm Ảnh Đã Tìm';
      newStep.target_match_step_id = '';
      newStep.delay_after = 1.0;
    } else if (type === 'template_tap') {
      newStep.name = '📸 Tìm & Bấm Ảnh';
      newStep.templates = [];
      newStep.threshold = 0.72;
      newStep.fallback_point = { x: 0, y: 0 };
      newStep.delay_after = 1.0;
    } else if (type === 'tap') {
      newStep.name = '👆 Nhấn tọa độ';
      newStep.point = { x: 0, y: 0 };
      newStep.delay_after = 1.0;
    } else if (type === 'key_back') {
      newStep.name = '🔙 Bấm phím Trở Về (Back)';
      newStep.repeat_count = 1;
      newStep.repeat_delay = 0.5;
    } else if (type === 'swipe') {
      newStep.name = '↔️ Vuốt màn hình';
      newStep.swipe_from = { x: 360, y: 400 };
      newStep.swipe_to = { x: 360, y: 900 };
      newStep.duration_ms = 400;
    } else if (type === 'delay') {
      newStep.name = '⏳ Chờ đợi';
      newStep.delay_seconds = 2.0;
    } else if (type === 'run_scenario') {
      let foundSubId = '';
      let foundSubName = '';
      for (const s of scenarios) {
        if (s.id !== activeScenario.id) {
          foundSubId = s.id;
          foundSubName = s.name;
          break;
        }
      }
      newStep.target_scenario_id = foundSubId;
      if (foundSubName) {
        newStep.name = foundSubName;
      } else {
        newStep.name = 'Gọi kịch bản con';
      }
    } else if (type === 'finish') {
      newStep.name          = '🏁 Dừng & Báo Thành Công';
      newStep.finish_status = 'success';
    }

    updateActiveScenario((prev) => ({
      ...prev,
      steps: [...prev.steps, newStep],
    }));
  };

  // Kéo thả thay đổi vị trí tác nhân (Drag & Drop)
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    setDraggedIdx(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!activeScenario || draggedIdx === null || draggedIdx === targetIndex) {
      setDraggedIdx(null);
      return;
    }
    const steps = [...activeScenario.steps];
    const itemToMove = steps.splice(draggedIdx, 1)[0];
    steps.splice(targetIndex, 0, itemToMove);
    setDraggedIdx(null);
    updateActiveScenario((prev) => ({ ...prev, steps }));
  };

  // Di chuyển bước lên/xuống bằng nút
  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if (!activeScenario) return;
    const steps = [...activeScenario.steps];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    const temp = steps[index];
    steps[index] = steps[targetIdx];
    steps[targetIdx] = temp;
    updateActiveScenario((prev) => ({ ...prev, steps }));
  };

  const handleCanvasContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode !== 'n8n' || !canvasViewportRef.current) return;
    event.preventDefault();
    const rect = canvasViewportRef.current.getBoundingClientRect();
    const position = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    canvasContextMenuRef.current = position;
    setCanvasContextMenu(position);
  };

  const handleCanvasContextMenuOutside = (event: MouseEvent) => {
    if (canvasContextMenuElementRef.current && !canvasContextMenuElementRef.current.contains(event.target as Node)) {
      canvasContextMenuRef.current = null;
      setCanvasContextMenu(null);
    }
  };

  const handleCanvasMenuWheel = () => {
    canvasContextMenuRef.current = null;
    setCanvasContextMenu(null);
  };

  useEffect(() => {
    if (!canvasContextMenu) return;
    window.addEventListener('mousedown', handleCanvasContextMenuOutside);
    window.addEventListener('wheel', handleCanvasMenuWheel, { once: true });
    return () => {
      window.removeEventListener('mousedown', handleCanvasContextMenuOutside);
      window.removeEventListener('wheel', handleCanvasMenuWheel);
    };
  }, [canvasContextMenu]);

  const addStepFromCanvasMenu = (type: ActionType) => {
    const viewport = canvasViewportRef.current;
    const menuPosition = canvasContextMenuRef.current;
    if (!viewport || !menuPosition) return;
    const x = Math.max(16, Math.round((menuPosition.x + viewport.scrollLeft - 16) / canvasZoom));
    const y = Math.max(16, Math.round((menuPosition.y + viewport.scrollTop - 16) / canvasZoom));
    canvasContextMenuRef.current = null;
    setCanvasContextMenu(null);
    handleAddStep(type, { x, y });
  };

  // Xóa một bước
  const handleDeleteStep = (stepId: string) => {
    if (!activeScenario) return;
    updateActiveScenario((prev) => ({
      ...prev,
      steps: prev.steps.filter((st) => st.id !== stepId),
    }));
  };

  // Lấy tọa độ hiển thị node trên Canvas n8n
  const getNodePos = (step: ScenarioStep, idx: number) => {
    if (typeof step.node_x === 'number' && typeof step.node_y === 'number') {
      return { x: step.node_x, y: step.node_y };
    }
    const cols = 3;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return {
      x: 40 + col * (240 + 100),
      y: 40 + row * (120 + 180),
    };
  };

  const routedConnections = useMemo(() => routeConnections(
    (activeScenario?.steps || []).map((step, index) => ({ id: step.id, type: step.type, ...getNodePos(step, index), width: 244, height: 172 })),
    activeScenario?.connections || [],
  ), [activeScenario?.steps, activeScenario?.connections]);
  const handleAutoLayout = () => {
    if (!activeScenario) {
      return;
    }
    if (activeScenario.steps.length === 0) {
      return;
    }

    const steps = [...activeScenario.steps];
    const connections = activeScenario.connections || [];

    const START_X = 24;
    const START_Y = 24;

    const viewport = canvasViewportRef.current;
    const availableWidth = Math.max(244, (viewport?.clientWidth ?? 1300) - 32);
    const availableHeight = Math.max(172, (viewport?.clientHeight ?? 700) - 32);
    const cardWidth = 244;
    const cardHeight = 172;
    const colStep = 340;
    const rowStep = 300;
    const layoutFor = (cols: number) => computeOptimalLayout(steps, connections, {
      startX: START_X,
      startY: START_Y,
      colStep,
      rowStep,
      maxCols: cols,
    });
    const candidates = Array.from({ length: Math.min(4, steps.length) }, (_, index) => {
      const positions = layoutFor(index + 1);
      const bounds = [...positions.values()];
      const width = Math.max(...bounds.map(p => p.x + cardWidth)) + START_X;
      const height = Math.max(...bounds.map(p => p.y + cardHeight)) + START_Y;
      return { positions, zoom: Math.min(1, availableWidth / width, availableHeight / height) };
    });
    const best = candidates.reduce((a, b) => b.zoom >= a.zoom - 0.02 ? b : a);
    const posMap = best.positions;
    setCanvasZoom(Math.max(0.1, Math.floor(best.zoom * 100) / 100));

    const updatedSteps = steps.map(st => {
      const p = posMap.get(st.id) || { x: START_X, y: START_Y };
      return { ...st, node_x: Math.round(p.x), node_y: Math.round(p.y) };
    });

    canvasViewportRef.current?.scrollTo({ left: 0, top: 0 });


    // Cập nhật vị trí lên màn hình UI (KHÔNG tự động gọi save để không báo toast nhầm)
    updateActiveScenario((prev) => ({
      ...prev,
      steps: updatedSteps,
    }));
  };

  // Bắt đầu kéo card trên Canvas
  const handleNodeMouseDown = (e: React.MouseEvent, stepId: string, currentPos: { x: number; y: number }) => {
    if (connectingFromId) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) {
      panStateRef.current = null;
      return;
    }
    e.preventDefault();
    dragMoveDistance.current = 0;
    setDraggedNodeId(stepId);
    dragStartMouse.current = { x: e.clientX, y: e.clientY };
    dragStartNodePos.current = { ...currentPos };
  };

  // Lắng nghe chuột di chuyển và nhả chuột toàn màn hình cho kéo thả Canvas (Tính theo tỷ lệ zoom)
  useEffect(() => {
    if (!draggedNodeId) return;

    const handleMouseMove = (e: MouseEvent) => {
      dragMoveDistance.current += Math.abs(e.movementX) + Math.abs(e.movementY);
      const deltaX = (e.clientX - dragStartMouse.current.x) / canvasZoom;
      const deltaY = (e.clientY - dragStartMouse.current.y) / canvasZoom;
      const newX = Math.max(10, Math.round(dragStartNodePos.current.x + deltaX));
      const newY = Math.max(10, Math.round(dragStartNodePos.current.y + deltaY));

      updateActiveScenario((prev) => ({
        ...prev,
        steps: prev.steps.map((st) => (st.id === draggedNodeId ? { ...st, node_x: newX, node_y: newY } : st)),
      }));

    };

    const handleMouseUp = () => {
      setDraggedNodeId(null);
      panStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedNodeId, canvasZoom]);

  // Thêm liên kết mũi tên giữa 2 card (hỗ trợ phân nhánh branch)
  const handleAddConnection = (fromId: string, toId: string, branch: 'default' | 'true' | 'false' = 'default') => {
    if (fromId === toId) {
      return;
    }
    if (!activeScenario) {
      return;
    }
    updateActiveScenario((prev) => {
      let currentConns = prev.connections;
      if (!currentConns) {
        currentConns = [];
      }
      // Loại bỏ liên kết cũ nếu cùng fromId và cùng nhánh branch
      const filtered = currentConns.filter(
        (c) => !(c.from_id === fromId && (c.branch || 'default') === branch)
      );
      const newConns = [...filtered, { from_id: fromId, to_id: toId, branch: branch }];
      const result = {
        ...prev,
        connections: newConns,
      };
      return result;
    });
    setConnectingFrom(null);
  };

  // Xóa một liên kết mũi tên
  const handleDeleteConnection = (fromId: string, toId: string, branch?: string) => {
    if (!activeScenario) {
      return;
    }
    updateActiveScenario((prev) => {
      let currentConns = prev.connections;
      if (!currentConns) {
        currentConns = [];
      }
      const filtered = currentConns.filter((c) => {
        if (c.from_id === fromId && c.to_id === toId) {
          if (branch) {
            const isSameBranch = (c.branch || 'default') === branch;
            if (isSameBranch) {
              return false;
            }
          } else {
            return false;
          }
        }
        return true;
      });
      const result = {
        ...prev,
        connections: filtered,
      };
      return result;
    });
  };

  // Bắt đầu kéo mũi tên từ cổng OUT (với nhánh branch tương ứng)
  const handleStartConnect = (e: React.MouseEvent, stepId: string, branch: 'default' | 'true' | 'false' = 'default') => {
    e.stopPropagation();
    e.preventDefault();
    setConnectingFrom({ stepId: stepId, branch: branch });
    if (canvasInnerRef.current) {
      const rect = canvasInnerRef.current.getBoundingClientRect();
      const calcX = (e.clientX - rect.left) / canvasZoom;
      const calcY = (e.clientY - rect.top) / canvasZoom;
      setConnectingMousePos({
        x: calcX,
        y: calcY,
      });
    }
  };

  // Thả chuột vào cổng IN hoặc Card đích để hoàn thành nối mũi tên
  const handleEndConnect = (e: React.MouseEvent, targetStepId: string) => {
    e.stopPropagation();
    if (connectingFrom) {
      if (connectingFrom.stepId !== targetStepId) {
        handleAddConnection(connectingFrom.stepId, targetStepId, connectingFrom.branch);
      }
    }
    setConnectingFrom(null);
  };

  // Theo dõi chuột khi đang kéo nối mũi tên tự do (Tính theo tỷ lệ zoom)
  useEffect(() => {
    if (!connectingFrom) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (canvasInnerRef.current) {
        const rect = canvasInnerRef.current.getBoundingClientRect();
        const calcX = (e.clientX - rect.left) / canvasZoom;
        const calcY = (e.clientY - rect.top) / canvasZoom;
        setConnectingMousePos({
          x: calcX,
          y: calcY,
        });
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 2) return;
      setConnectingFrom(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConnectingFrom(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [connectingFrom, canvasZoom]);

  // Bật/Dừng Scenario Engine tổng
  const handleToggleEngine = async (desiredState?: boolean) => {
    const shouldStart = desiredState ?? !isRunningEngineRef.current;
    if (shouldStart && !selectedSerial) {
      alert('Vui lòng kết nối thiết bị trước khi bật Engine!');
      return;
    }

    try {
      const response = await fetch(
        `${apiBase}/api/scenarios/engine/${shouldStart ? 'start' : 'stop'}`,
        shouldStart ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serial: selectedSerial }),
        } : { method: 'POST' },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      isRunningEngineRef.current = shouldStart;
      setIsRunningEngine(shouldStart);
      window.dispatchEvent(new CustomEvent('studio-engine-state', { detail: shouldStart }));
    } catch (error) {
      alert(`Không thể ${shouldStart ? 'bật' : 'dừng'} Engine: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  engineToggleRef.current = handleToggleEngine;

  useEffect(() => {
    const start = () => { void engineToggleRef.current(true); };
    const stop = () => { void engineToggleRef.current(false); };
    window.addEventListener('studio-start-engine', start);
    window.addEventListener('studio-stop-engine', stop);
    return () => {
      window.removeEventListener('studio-start-engine', start);
      window.removeEventListener('studio-stop-engine', stop);
    };
  }, []);

  // Chạy thử toàn bộ kịch bản hiện tại
  const handleRunActiveScenario = async () => {
    if (!selectedSerial || !activeScenario) {
      alert('Vui lòng kết nối thiết bị!');
      return;
    }
    setRunningScenarioId(activeScenario.id);
    setRunError(null);
    try {
      await handleSaveAll(); // Tự động lưu trước khi chạy
      const response = await fetch(`${apiBase}/api/scenarios/${activeScenario.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: selectedSerial }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Backend trả về HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }
    } catch (e) {
      const message = e instanceof TypeError && e.message === 'Failed to fetch'
        ? `Không kết nối được Backend tại ${apiBase}. Kiểm tra Backend đang chạy và CORS cho origin hiện tại.`
        : String(e);
      setRunError(message);
    } finally {
      setRunningScenarioId(null);
    }
  };

  // Dừng chạy thử kịch bản ngay lập tức
  const handleStopScenario = async () => {
    try {
      await fetch(`${apiBase}/api/scenarios/stop`, { method: 'POST' });
      setRunningScenarioId(null);
    } catch (e) {
      console.error('Lỗi dừng kịch bản:', e);
    }
  };

  // Chạy thử 1 bước đơn lẻ
  const handleTestSingleStep = async (step: ScenarioStep) => {
    if (!selectedSerial) {
      alert('Vui lòng kết nối thiết bị!');
      return;
    }
    setTestingStepId(step.id);
    try {
      await fetch(`${apiBase}/api/scenarios/step/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: selectedSerial, step }),
      });
    } catch (e) {
      alert('Lỗi thử bước: ' + String(e));
    } finally {
      setTestingStepId(null);
    }
  };

  // Chạy thử kịch bản từ đầu tới bước chỉ định này rồi dừng
  const handleRunUntilStep = async (stepId: string) => {
    if (!selectedSerial) {
      alert('Vui lòng kết nối thiết bị!');
      return;
    }
    if (!activeScenario) {
      alert('Chưa chọn kịch bản nào!');
      return;
    }
    setRunningScenarioId(activeScenario.id);
    try {
      await handleSaveAll();
      const payload = {
        serial:       selectedSerial,
        stop_step_id: stepId,
      };
      await fetch(`${apiBase}/api/scenarios/${activeScenario.id}/run-until`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } catch (e) {
      alert('Lỗi chạy thử nghiệm đến bước: ' + String(e));
    } finally {
      setRunningScenarioId(null);
    }
  };

  // Cắt ảnh trực tiếp từ Game vào danh sách ảnh của bước
  const handleDirectCropFromGame = (step: ScenarioStep) => {
    if (!selectedSerial) {
      alert('Chưa kết nối BlueStacks! Hãy bật BlueStacks trước.');
      return;
    }

    onStartPick(`✂️ Kéo chuột khoanh vùng để cắt ảnh cho [${step.name}]`, async (point: Point, box?: BoxRegion) => {
      const count = (step.templates || []).length + 1;
      const tplName = `crop_${step.id.substring(0, 5)}_${Date.now().toString(36)}_p${count}.png`;

      let payload: any = {
        serial: selectedSerial,
        template_name: tplName,
      };

      if (box && Math.abs(box.x2 - box.x1) >= 8 && Math.abs(box.y2 - box.y1) >= 8) {
        payload.x1 = Math.min(box.x1, box.x2);
        payload.y1 = Math.min(box.y1, box.y2);
        payload.x2 = Math.max(box.x1, box.x2);
        payload.y2 = Math.max(box.y1, box.y2);
        payload.x = Math.round((box.x1 + box.x2) / 2);
        payload.y = Math.round((box.y1 + box.y2) / 2);
      } else {
        payload.x = point.x;
        payload.y = point.y;
        payload.radius = 35;
      }

      try {
        const res = await fetch(`${apiBase}/api/auto/template/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          setRefreshImgKey(Date.now());
          loadTemplatesList();
          updateActiveScenario((prev) => ({
            ...prev,
            steps: prev.steps.map((st) => {
              if (st.id === step.id) {
                const currentTpls = st.templates || [];
                const updatedTpls = currentTpls.includes(tplName) ? currentTpls : [...currentTpls, tplName];
                return {
                  ...st,
                  template_name: tplName,
                  templates: updatedTpls,
                };
              }
              return st;
            }),
          }));
        } else {
          alert('Không thể lưu ảnh cắt từ game!');
        }
      } catch (e) {
        alert('Lỗi kết nối khi cắt ảnh: ' + String(e));
      }
    });
  };

  // Nạp ảnh tải lên từ máy tính (Upload FileReader Base64)
  const handleUploadFileForStep = async (stepId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const res = await fetch(`${apiBase}/api/auto/template/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            base64_data: base64Data,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const uploadedName = data.name;
          setRefreshImgKey(Date.now());
          loadTemplatesList();
          updateActiveScenario((prev) => ({
            ...prev,
            steps: prev.steps.map((st) => {
              if (st.id === stepId) {
                const currentTpls = st.templates || [];
                const updatedTpls = currentTpls.includes(uploadedName) ? currentTpls : [...currentTpls, uploadedName];
                return { ...st, template_name: uploadedName, templates: updatedTpls };
              }
              return st;
            }),
          }));
        } else {
          alert('Lỗi nạp ảnh lên máy chủ!');
        }
      } catch (err) {
        alert('Không thể tải ảnh: ' + String(err));
      }
    };
    reader.readAsDataURL(file);
  };

  // Thêm ảnh từ thư viện có sẵn vào bước
  const handleAddTemplateToStep = (stepId: string, templateName: string) => {
    if (!templateName) return;
    updateActiveScenario((prev) => ({
      ...prev,
      steps: prev.steps.map((st) => {
        if (st.id === stepId) {
          const currentTpls = st.templates || [];
          if (!currentTpls.includes(templateName)) {
            return { ...st, template_name: templateName, templates: [...currentTpls, templateName] };
          }
        }
        return st;
      }),
    }));
  };

  // Xóa 1 ảnh khỏi danh sách nhiều ảnh của bước
  const handleRemoveTemplateFromStep = (stepId: string, tplToRemove: string) => {
    updateActiveScenario((prev) => ({
      ...prev,
      steps: prev.steps.map((st) => {
        if (st.id === stepId) {
          const updatedTpls = (st.templates || []).filter((t) => t !== tplToRemove);
          const nextPrimary = updatedTpls.length > 0 ? updatedTpls[0] : '';
          return { ...st, template_name: nextPrimary, templates: updatedTpls };
        }
        return st;
      }),
    }));
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      {/* Engine control is displayed in the application header. */}
      <div hidden>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: isRunningEngine ? '#22c55e' : '#64748b', boxShadow: isRunningEngine ? '0 0 10px #22c55e' : 'none' }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
              Trình Chạy Macro (Engine): {(engineRunning ?? isRunningEngine) ? <span style={{ color: '#22c55e' }}>ĐANG CHẠY TỰ ĐỘNG</span> : <span style={{ color: '#94a3b8' }}>ĐÃ DỪNG</span>}
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Tự động lặp lại các kịch bản đang BẬT theo thời gian đặt trước</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              if (onToggleEngineProp) onToggleEngineProp();
              else handleToggleEngine();
              window.dispatchEvent(new CustomEvent('studio-engine-state', { detail: !isRunningEngine }));
            }}
            style={{
              padding: '6px 16px',
              background: isRunningEngine ? '#dc2626' : '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {isRunningEngine ? '🛑 DỪNG TOÀN BỘ' : '▶ BẬT CHẠY TỰ ĐỘNG'}
          </button>
        </div>
      </div>

      {/* Main 2 Columns Layout */}
      <div style={{ display: 'flex', flex: 1, gap: 12, overflow: 'hidden' }}>
        <style>{`
          @keyframes runningGlowPulse {
            0% {
              box-shadow: 0 0 15px #38bdf8, 0 0 30px rgba(56, 189, 248, 0.6), inset 0 0 10px rgba(56, 189, 248, 0.3);
              border-color: #38bdf8;
            }
            50% {
              box-shadow: 0 0 25px #00f0ff, 0 0 50px rgba(0, 240, 255, 0.9), inset 0 0 20px rgba(0, 240, 255, 0.5);
              border-color: #00f0ff;
            }
            100% {
              box-shadow: 0 0 15px #38bdf8, 0 0 30px rgba(56, 189, 248, 0.6), inset 0 0 10px rgba(56, 189, 248, 0.3);
              border-color: #38bdf8;
            }
          }
          @keyframes flowConnectionDash {
            from {
              stroke-dashoffset: 24;
            }
            to {
              stroke-dashoffset: 0;
            }
          }
        `}</style>
        {/* Left Column: Danh sách kịch bản (270px) */}
        <div style={{ width: 270, background: '#0b1120', borderRadius: 8, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', padding: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>DANH SÁCH KỊCH BẢN</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Chỉ kịch bản BẬT mới chạy auto</div>
            </div>
            <button
              onClick={handleAddScenario}
              style={{
                background: '#0284c7',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Tạo thêm kịch bản mới"
            >
              + Tạo Mới
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
            {scenarios.length === 0 && (
              <div style={{ padding: '20px 10px', textAlign: 'center', color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>
                Chưa có kịch bản. Nhấn "+ Tạo Mới" ở trên để bắt đầu!
              </div>
            )}
            {scenarios.map((sc) => {
              const isSelected = sc.id === selectedId;
              let isScRunning = false;
              if (execState && execState.is_running) {
                if (execState.active_scenario_ids && execState.active_scenario_ids.includes(sc.id)) {
                  isScRunning = true;
                } else if (execState.scenario_id === sc.id) {
                  isScRunning = true;
                }
              }

              let scBorderColor = '#1e293b';
              let scBgColor = '#0f172a';
              let scBoxShadow = 'none';

              if (isScRunning) {
                scBorderColor = '#22c55e';
                scBgColor = '#062d1f';
                scBoxShadow = '0 0 14px rgba(34, 197, 94, 0.7)';
              } else if (isSelected) {
                scBorderColor = '#38bdf8';
                scBgColor = '#1e293b';
              } else if (sc.enabled) {
                scBorderColor = '#166534';
              }

              return (
                <div
                  key={sc.id}
                  onClick={() => setSelectedId(sc.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: scBgColor,
                    border: `1.5px solid ${scBorderColor}`,
                    boxShadow: scBoxShadow,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 170 }}>
                      {isScRunning && (
                        <span style={{ fontSize: 9, background: '#16a34a', color: '#fff', padding: '1px 5px', borderRadius: 8, fontWeight: 900, whiteSpace: 'nowrap' }}>
                          ⚡ CHẠY
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: isSelected ? 700 : 600, color: isSelected ? '#38bdf8' : '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sc.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = scenarios.map((item) => (item.id === sc.id ? { ...item, enabled: !sc.enabled } : item));
                        setScenarios(updated);
                        handleSaveAll(updated);
                      }}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        background: sc.enabled ? '#15803d' : '#334155',
                        color: sc.enabled ? '#dcfce7' : '#94a3b8',
                      }}
                      title="Bấm để Bật/Tắt tự động chạy kịch bản này"
                    >
                      {sc.enabled ? 'BẬT' : 'TẮT'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: sc.enabled ? '#4ade80' : '#64748b' }}>
                    <span>{sc.steps.length} hành động</span>
                    <span>
                      {sc.enabled
                        ? (sc.interval_minutes > 0 ? `Lặp mỗi ${sc.interval_minutes}p` : 'Bật (chạy tay)')
                        : 'Kịch bản con (tắt auto)'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Trình soạn thảo kịch bản (Scenario Builder) */}
        {activeScenario ? (
          <div style={{ flex: 1, background: '#0b1120', borderRadius: 8, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', padding: 12, overflow: 'hidden', position: 'relative' }}>
            {/* Header Kịch Bản */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <input
                  type="text"
                  value={activeScenario.name}
                  onChange={(e) => updateActiveScenario((prev) => ({ ...prev, name: e.target.value }))}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    padding: '5px 10px',
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 700,
                    width: 240,
                  }}
                  placeholder="Tên kịch bản..."
                />

                <button
                  type="button"
                  onClick={() => {
                    const newVal = !activeScenario.enabled;
                    updateActiveScenario((prev) => ({ ...prev, enabled: newVal }));
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: activeScenario.enabled ? '#14532d' : '#1e293b',
                    color: activeScenario.enabled ? '#4ade80' : '#94a3b8',
                    border: '1px solid',
                    borderColor: activeScenario.enabled ? '#22c55e' : '#475569',
                  }}
                  title="Chỉ các kịch bản BẬT mới được tự động chạy khi Engine hoạt động. Kịch bản tắt có thể dùng làm kịch bản con."
                >
                  {activeScenario.enabled ? '🟢 BẬT TỰ ĐỘNG CHẠY' : '⚪ KỊCH BẢN CON / TẮT AUTO'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
                  <span>⏱ Hẹn giờ mỗi:</span>
                  <input
                    type="number"
                    min={0}
                    value={activeScenario.interval_minutes}
                    onChange={(e) => updateActiveScenario((prev) => ({ ...prev, interval_minutes: Number(e.target.value) || 0 }))}
                    style={{
                      width: 44,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#38bdf8',
                      padding: '4px 6px',
                      borderRadius: 4,
                      textAlign: 'center',
                      fontWeight: 700,
                    }}
                  />
                  <span>phút</span>
                </div>

                {/* Cấu hình lặp lại toàn bộ quy trình (A -> B -> A -> B) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#1c1024', padding: '3px 8px', borderRadius: 5, border: '1px solid #701a75' }}>
                  <span style={{ color: '#f472b6', fontWeight: 700 }} title="Lặp lại toàn bộ các bước từ đầu đến cuối theo chu kỳ A -> B -> A -> B">🔁 Lặp quy trình:</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={activeScenario.loop_count ?? 1}
                    onChange={(e) => updateActiveScenario((prev) => ({ ...prev, loop_count: Math.max(1, Number(e.target.value) || 1) }))}
                    style={{
                      width: 44,
                      background: '#0b1120',
                      border: '1px solid #db2777',
                      color: '#f472b6',
                      padding: '3px 4px',
                      borderRadius: 4,
                      textAlign: 'center',
                      fontWeight: 700,
                    }}
                  />
                  <span style={{ color: '#fbcfe8' }}>vòng</span>

                  {(activeScenario.loop_count ?? 1) > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>nghỉ:</span>
                      <input
                        type="number"
                        step={0.1}
                        min={0.1}
                        value={activeScenario.loop_delay ?? 0.5}
                        onChange={(e) => updateActiveScenario((prev) => ({ ...prev, loop_delay: Number(e.target.value) || 0.5 }))}
                        style={{ width: 44, background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', padding: '3px 4px', borderRadius: 4, textAlign: 'center' }}
                      />
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>s</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => handleSaveAll()}
                  disabled={isSaving}
                  style={{
                    background: saveFeedback?.type === 'success' ? '#15803d' : '#0284c7',
                    color: 'white',
                    border: saveFeedback?.type === 'success' ? '1px solid #22c55e' : 'none',
                    padding: '6px 14px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: saveFeedback?.type === 'success' ? '0 0 10px rgba(34, 197, 94, 0.4)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                  title="Lưu toàn bộ kịch bản vào cơ sở dữ liệu"
                >
                  {isSaving ? (
                    <>
                      <span>⏳</span>
                      <span>ĐANG LƯU...</span>
                    </>
                  ) : saveFeedback?.type === 'success' ? (
                    <>
                      <span>✅</span>
                      <span>ĐÃ LƯU XONG</span>
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      <span>LƯU KỊCH BẢN</span>
                    </>
                  )}
                </button>

                {/* Nút Chạy Thử hoặc Nút Tạm Dừng / Dừng Lại */}
                {execState?.is_running || runningScenarioId === activeScenario.id ? (
                  <button
                    type="button"
                    onClick={handleStopScenario}
                    style={{
                      background: '#dc2626',
                      color: 'white',
                      border: 'none',
                      padding: '6px 16px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 0 14px rgba(220, 38, 38, 0.7)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    title="Bấm để dừng ngay lập tức kịch bản đang chạy thử"
                  >
                    ⏹ DỪNG LẠI
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRunActiveScenario}
                    style={{
                      background: '#16a34a',
                      color: 'white',
                      border: 'none',
                      padding: '6px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 0 10px rgba(22, 163, 74, 0.4)',
                    }}
                    title="Bắt đầu chạy thử toàn bộ kịch bản này"
                  >
                    ▶ CHẠY THỬ KỊCH BẢN
                  </button>
                )}

                {/* Nút Xem Báo Cáo Chạy Thử */}
                <button
                  type="button"
                  onClick={handleOpenReportModal}
                  style={{
                    background: '#1e1b4b',
                    color: '#c7d2fe',
                    border: '1px solid #4f46e5',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    boxShadow: '0 0 8px rgba(79, 70, 229, 0.3)',
                  }}
                  title="Xem bảng thống kê tóm tắt các bước đã chạy, kết quả If/Else và thời gian xử lý"
                >
                  📊 BÁO CÁO CHẠY THỬ
                </button>

                {/* Đường phân cách ngăn nhầm lẫn */}
                <div style={{ width: 1, height: 22, background: '#334155', margin: '0 4px' }} />

                {/* Nút Xóa Kịch Bản tách riêng an toàn */}
                <button
                  type="button"
                  onClick={() => handleDeleteScenario(activeScenario.id)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #475569',
                    color: '#94a3b8',
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#dc2626';
                    e.currentTarget.style.color = '#f87171';
                    e.currentTarget.style.background = '#450a0a';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#475569';
                    e.currentTarget.style.color = '#94a3b8';
                    e.currentTarget.style.background = 'transparent';
                  }}
                  title="Xóa kịch bản này khỏi hệ thống"
                >
                  🗑 Xóa kịch bản
                </button>
              </div>
            </div>

            {/* View Mode Switcher: n8n Flow vs List View */}
            {runError && !execState?.is_running && !runningScenarioId && (
              <div role="alert" style={{ margin: '8px 0', padding: '10px 14px', color: '#fecaca', background: '#450a0a', border: '1px solid #ef4444', borderRadius: 6, fontSize: 12 }}>
                Lỗi kết nối: {runError}
                <button type="button" onClick={() => setRunError(null)} style={{ marginLeft: 12, color: '#fee2e2', background: 'transparent', border: 0, cursor: 'pointer' }}>Đóng</button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>CHẾ ĐỘ XEM:</span>
                <button
                  type="button"
                  onClick={() => setViewMode('n8n')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: viewMode === 'n8n' ? '#0284c7' : '#1e293b',
                    color: viewMode === 'n8n' ? '#ffffff' : '#94a3b8',
                    border: '1px solid',
                    borderColor: viewMode === 'n8n' ? '#38bdf8' : '#334155',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  🌐 Sơ Đồ Mũi Tên Liên Kết
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: viewMode === 'list' ? '#0284c7' : '#1e293b',
                    color: viewMode === 'list' ? '#ffffff' : '#94a3b8',
                    border: '1px solid',
                    borderColor: viewMode === 'list' ? '#38bdf8' : '#334155',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  📋 Danh Sách Chi Tiết
                </button>

                {viewMode === 'n8n' && (
                  <>
                    <button
                      type="button"
                      onClick={handleAutoLayout}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: '#1e1b4b',
                        color: '#a5b4fc',
                        border: '1px solid #4338ca',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                      title="Tự động sắp xếp lại các card theo hàng lối ngăn nắp"
                    >
                      📐 Tự Động Xếp Lưới
                    </button>

                    {/* Bộ điều khiển thu phóng Zoom */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        background: 'rgba(15, 23, 42, 0.92)',
                        border: '1px solid #334155',
                        borderRadius: 20,
                        padding: '2px 7px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setCanvasZoom((z) => Math.max(0.1, Math.round((z - 0.1) * 10) / 10))}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#1e293b',
                          border: '1px solid #475569',
                          color: '#ffffff',
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                        }}
                        title="Thu nhỏ sơ đồ (-)"
                      >
                        −
                      </button>
                      <span
                        onClick={() => setCanvasZoom(1.0)}
                        style={{
                          fontSize: 11,
                          color: '#38bdf8',
                          fontWeight: 800,
                          padding: '0 4px',
                          cursor: 'pointer',
                          minWidth: 36,
                          textAlign: 'center',
                          userSelect: 'none',
                        }}
                        title="Click để đưa về 100%"
                      >
                        {Math.round(canvasZoom * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => setCanvasZoom((z) => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#1e293b',
                          border: '1px solid #475569',
                          color: '#ffffff',
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                        }}
                        title="Phóng to sơ đồ (+)"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => setCanvasZoom(1.0)}
                        style={{
                          background: '#0284c7',
                          border: 'none',
                          color: '#ffffff',
                          fontSize: 10,
                          cursor: 'pointer',
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontWeight: 700,
                        }}
                        title="Đặt lại cỡ chuẩn 100%"
                      >
                        100%
                      </button>
                    </div>

                    {(activeScenario.connections || []).length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Bạn có chắc muốn xóa tất cả các mũi tên liên kết trên sơ đồ?')) {
                            updateActiveScenario((prev) => ({ ...prev, connections: [] }));
                          }
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: '#450a0a',
                          color: '#f87171',
                          border: '1px solid #dc2626',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        title="Xóa tất cả các mũi tên nối"
                      >
                        ✂️ Xóa Mọi Mũi Tên ({activeScenario.connections?.length})
                      </button>
                    )}


                  </>
                )}
              </div>

              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                Tổng: <strong style={{ color: '#38bdf8' }}>{activeScenario.steps.length}</strong> hành động
              </span>
            </div>

            {viewMode === 'list' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #1e293b' }}>
                <ActionDropdown onSelectAction={handleAddStep} />
                <span style={{ fontSize: 11, color: '#64748b' }}>Thêm hành động vào kịch bản</span>
              </div>
            )}

            {/* Steps Rendering Area: Free n8n Canvas vs List View */}
            {viewMode === 'n8n' ? (
              <div
                ref={canvasViewportRef}
                onContextMenu={handleCanvasContextMenu}
                onWheel={(event) => {
                  const delta = event.deltaY < 0 ? 0.08 : -0.08;
                  setCanvasZoom((prev) => Math.min(2.0, Math.max(0.1, Math.round((prev + delta) * 100) / 100)));
                }}
                onMouseDown={(event) => {
                  if (event.button !== 0 || event.target !== event.currentTarget) return;
                  const viewport = canvasViewportRef.current;
                  if (!viewport) return;
                  panStateRef.current = { pointerX: event.clientX, pointerY: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
                  viewport.style.cursor = 'grabbing';
                  event.preventDefault();
                }}
                style={{
                  flex: 1,
                  overflow: 'auto',
                  position: 'relative',
                  backgroundImage: 'radial-gradient(#1e293b 1.5px, transparent 1.5px)',
                  backgroundSize: `${24 * canvasZoom}px ${24 * canvasZoom}px`,
                  backgroundColor: '#070b14',
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                {canvasContextMenu && (
                  <div ref={canvasContextMenuElementRef} style={{ position: 'fixed', left: Math.min(window.innerWidth - 380, (canvasViewportRef.current?.getBoundingClientRect().left ?? 0) + canvasContextMenu.x), top: Math.min(window.innerHeight - 480, (canvasViewportRef.current?.getBoundingClientRect().top ?? 0) + canvasContextMenu.y), zIndex: 12001, width: 360, maxHeight: 460, overflowY: 'auto', background: 'rgba(15, 23, 42, 0.98)', border: '1px solid #334155', borderRadius: 8, boxShadow: '0 16px 36px -4px rgba(0,0,0,.85)', padding: '6px 0' }}>
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b', color: '#38bdf8', fontSize: 11, fontWeight: 800 }}>CHỌN HÀNH ĐỘNG ĐỂ THÊM TẠI ĐÂY</div>
                      {ACTION_GROUPS.map((group) => (
                        <div key={group.category}>
                          <div style={{ padding: '5px 12px', color: '#64748b', fontSize: 9, fontWeight: 800 }}>{group.category}</div>
                          {group.items.map((item) => (
                            <button key={item.type} type="button" onClick={() => addStepFromCanvasMenu(item.type)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '8px 12px', border: 0, borderBottom: '1px solid rgba(30,41,59,.4)', background: 'transparent', color: item.color, cursor: 'pointer', textAlign: 'left' }}>
                              <span>{item.icon}</span><span style={{ fontWeight: 700 }}>{item.name}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                {activeScenario.steps.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b', fontSize: 13 }}>
                    Kịch bản chưa có hành động nào. Nhấp chuột phải vào vùng workflow để thêm hành động.
                  </div>
                ) : (
                  <div style={{
                    position: 'relative',
                    marginInline: 'auto',
                    width: Math.max(1, ...activeScenario.steps.map((st, i) => getNodePos(st, i).x + 268)) * canvasZoom,
                    height: Math.max(1, ...activeScenario.steps.map((st, i) => getNodePos(st, i).y + 196)) * canvasZoom,
                  }}>
                  <div
                    ref={canvasInnerRef}
                    style={{
                      position: 'relative',
                      width: Math.max(1, ...activeScenario.steps.map((st, i) => getNodePos(st, i).x + 268)),
                      height: Math.max(1, ...activeScenario.steps.map((st, i) => getNodePos(st, i).y + 196)),
                      transform: `scale(${canvasZoom})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    {/* Floating Helper Banner khi đang kéo mũi tên nối */}
                    {connectingFromId && (
                      <div
                        style={{
                          position: 'fixed',
                          top: 80,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          zIndex: 200,
                          background: '#064e3b',
                          border: '2px solid #22c55e',
                          color: '#ecfdf5',
                          padding: '8px 20px',
                          borderRadius: 24,
                          fontSize: 12,
                          fontWeight: 700,
                          boxShadow: '0 0 24px rgba(34, 197, 94, 0.7)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <span>🔗 Đang kéo mũi tên từ: <strong style={{ color: '#fef08a' }}>{activeScenario.steps.find((s) => s.id === connectingFromId)?.name}</strong></span>
                        <span>➔ Hãy rê chuột và nhả vào Card đích hoặc Cổng Vào (IN)!</span>
                        <button
                          type="button"
                          onClick={() => setConnectingFrom(null)}
                          style={{
                            background: '#ef4444',
                            border: 'none',
                            color: '#fff',
                            borderRadius: 4,
                            padding: '3px 10px',
                            fontSize: 11,
                            cursor: 'pointer',
                            fontWeight: 800,
                          }}
                        >
                          Hủy
                        </button>
                      </div>
                    )}

                    {/* SVG Bezier Curves connecting lines */}
                    <svg
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 10,
                      }}
                    >
                      <defs>
                        {/* Mũi tên to rõ nét, sắc nét, tương phản cao trên nền tối */}
                        <marker
                          id="n8n-arr"
                          markerWidth="12"
                          markerHeight="12"
                          refX="8"
                          refY="5"
                          orient="auto"
                          markerUnits="userSpaceOnUse"
                        >
                          <path d="M 0 1.5 L 8 5 L 0 8.5 L 2.5 5 z" fill="#38bdf8" stroke="#0284c7" strokeWidth="0.8" />
                        </marker>
                        <marker
                          id="n8n-arr-green"
                          markerWidth="12"
                          markerHeight="12"
                          refX="8"
                          refY="5"
                          orient="auto"
                          markerUnits="userSpaceOnUse"
                        >
                          <path d="M 0 1.5 L 8 5 L 0 8.5 L 2.5 5 z" fill="#22c55e" stroke="#15803d" strokeWidth="0.8" />
                        </marker>
                        <marker
                          id="n8n-arr-red"
                          markerWidth="12"
                          markerHeight="12"
                          refX="8"
                          refY="5"
                          orient="auto"
                          markerUnits="userSpaceOnUse"
                        >
                          <path d="M 0 1.5 L 8 5 L 0 8.5 L 2.5 5 z" fill="#f43f5e" stroke="#be123c" strokeWidth="0.8" />
                        </marker>
                      </defs>

                      {/* Hiển thị các mũi tên do người dùng nối (có phân loại nhánh True/False/Default) */}
                      {(() => {
                        return (activeScenario.connections || []).map((conn, connectionIndex) => {
                          const stepA = activeScenario.steps.find((s) => s.id === conn.from_id);
                          const stepB = activeScenario.steps.find((s) => s.id === conn.to_id);
                          if (!stepA || !stepB) return null;

                          const connBranch = conn.branch || 'default';
                          const route = routedConnections.get(connectionKey(conn, connectionIndex));
                          if (!route) return null;
                          const pathD = route.path;
                          const midX = route.labelX;
                          const badgeY = route.labelY - 10;

                          let isConnActive = false;
                          if (execState && execState.is_running) {
                            if (execState.active_connection) {
                              if (
                                execState.active_connection.from_id === conn.from_id &&
                                execState.active_connection.to_id === conn.to_id
                              ) {
                                isConnActive = true;
                              }
                            } else if (execState.current_step_id === conn.to_id) {
                              isConnActive = true;
                            }
                          }

                          let strokeColor = '#38bdf8';
                          let markerUrl = 'url(#n8n-arr)';
                          let shadowStyle = 'drop-shadow(0 0 2.5px rgba(56, 189, 248, 0.75))';
                          let lineWidth = '2.2';
                          let lineDash = 'none';
                          let lineAnim = 'none';

                          if (connBranch === 'true') {
                            strokeColor = '#22c55e';
                            markerUrl = 'url(#n8n-arr-green)';
                            shadowStyle = 'drop-shadow(0 0 3px rgba(34, 197, 94, 0.85))';
                          } else if (connBranch === 'false') {
                            strokeColor = '#f43f5e';
                            markerUrl = 'url(#n8n-arr-red)';
                            shadowStyle = 'drop-shadow(0 0 3px rgba(244, 63, 94, 0.85))';
                          }

                          if (isConnActive) {
                            strokeColor = '#00f0ff';
                            lineWidth = '3.5';
                            lineDash = '8 4';
                            lineAnim = 'flowConnectionDash 0.5s linear infinite';
                            shadowStyle = 'drop-shadow(0 0 6px #00f0ff) drop-shadow(0 0 12px rgba(0, 240, 255, 0.9))';
                          }

                          return (
                            <g key={`conn-${conn.from_id}-${conn.to_id}-${connBranch}`}>
                              <path
                                d={pathD}
                                stroke={strokeColor}
                                strokeWidth={lineWidth}
                                strokeDasharray={lineDash}
                                fill="none"
                                style={{ filter: shadowStyle, animation: lineAnim }}
                                markerEnd={markerUrl}
                              />

                              {/* Nút Xóa Mũi Tên Nối (KHÔNG gắn chữ CÓ/KHÔNG để tuyệt đối không đè che chữ hay card) */}
                              <foreignObject x={midX - 10} y={badgeY} width="20" height="20" style={{ overflow: 'visible', pointerEvents: 'auto' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteConnection(conn.from_id, conn.to_id, connBranch);
                                    }}
                                    style={{
                                      width: 16,
                                      height: 16,
                                      borderRadius: '50%',
                                      background: '#991b1b',
                                      border: '1.5px solid #ef4444',
                                      color: '#ffffff',
                                      fontSize: 9,
                                      fontWeight: 900,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      padding: 0,
                                      boxShadow: '0 2px 6px rgba(0,0,0,0.8)',
                                    }}
                                    title="Bấm để xóa mũi tên liên kết này"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </foreignObject>
                            </g>
                          );
                        });
                      })()}

                      {/* Live Drawing Arrow khi người dùng đang kéo chuột từ cổng OUT */}
                      {connectingFromId && (() => {
                        const sourceStep = activeScenario.steps.find((s) => s.id === connectingFromId);
                        if (!sourceStep) return null;
                        const sIdx = activeScenario.steps.indexOf(sourceStep);
                        const p1 = getNodePos(sourceStep, sIdx);
                        let startX = p1.x + 240;
                        let startY = p1.y + 62.5;
                        let strokeColor = '#38bdf8';
                        let markerUrl = 'url(#n8n-arr)';
                        const endX = connectingMousePos.x;
                        const endY = connectingMousePos.y;

                        let c1x = startX + 40;
                        let c1y = startY;
                        let c2x = endX - 40;
                        let c2y = endY;

                        const sourceIsConditional = sourceStep.type === 'if_template' || sourceStep.type === 'run_scenario';
                        const liveSwap = sourceIsConditional && (() => {
                          const sourceNode = sourceStep;
                          const trueTarget = activeScenario.connections?.find((c) => c.from_id === sourceNode.id && c.branch === 'true');
                          const falseTarget = activeScenario.connections?.find((c) => c.from_id === sourceNode.id && c.branch === 'false');
                          const trueStep = trueTarget && activeScenario.steps.find((step) => step.id === trueTarget.to_id);
                          const falseStep = falseTarget && activeScenario.steps.find((step) => step.id === falseTarget.to_id);
                          if (trueStep && falseStep) return getNodePos(trueStep, activeScenario.steps.indexOf(trueStep)).x > getNodePos(falseStep, activeScenario.steps.indexOf(falseStep)).x;
                          if (trueStep) return getNodePos(trueStep, activeScenario.steps.indexOf(trueStep)).x > p1.x + 120;
                          if (falseStep) return getNodePos(falseStep, activeScenario.steps.indexOf(falseStep)).x < p1.x + 60;
                          return false;
                        })();
                        const isMouseBelow = endY >= p1.y + 100;

                        if (sourceIsConditional) {
                          if (connectingBranch === 'true') {
                            startX = p1.x + (liveSwap ? 180 : 60);
                            startY = p1.y + 172;
                            strokeColor = '#22c55e';
                            markerUrl = 'url(#n8n-arr-green)';
                          } else if (connectingBranch === 'false') {
                            startX = p1.x + (liveSwap ? 60 : 180);
                            startY = p1.y + 172;
                            strokeColor = '#f43f5e';
                            markerUrl = 'url(#n8n-arr-red)';
                          } else {
                            startX = p1.x + 180;
                            startY = p1.y + 172;
                          }
                          // Đi thẳng đứng xuống từ tâm dấu chấm tròn:
                          c1x = startX;
                          c1y = startY + Math.max(25, Math.abs(endY - startY) * 0.45);
                          c2x = endX;
                          c2y = endY - 20;
                        } else {
                          strokeColor = '#22c55e';
                          markerUrl = 'url(#n8n-arr-green)';
                          if (isMouseBelow) {
                            startX = p1.x + 120;
                            startY = p1.y + 172;
                            c1x = startX;
                            c1y = startY + Math.max(25, (endY - startY) * 0.45);
                            c2x = endX;
                            c2y = endY - 20;
                          } else {
                            startX = p1.x + 240;
                            startY = p1.y + 86;
                            const dx = Math.max(25, Math.abs(endX - startX) / 2);
                            c1x = startX + dx;
                            c1y = startY;
                            c2x = endX - dx;
                            c2y = endY;
                          }
                        }

                        const pathD = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;

                        return (
                          <g>
                            <path
                              d={pathD}
                              stroke={strokeColor}
                              strokeWidth="2.2"
                              strokeDasharray="5 3"
                              fill="none"
                              style={{ filter: `drop-shadow(0 0 3px ${strokeColor})` }}
                              markerEnd={markerUrl}
                            />
                            <circle cx={endX} cy={endY} r="4" fill={strokeColor} />
                          </g>
                        );
                      })()}
                    </svg>

                    {/* Nodes draggable anywhere on Canvas */}
                    {(() => {
                      // Tạo tập hợp các cổng đang có kết nối để chỉ hiển thị các chấm cổng thực sự được kết nối hoặc đang kéo
                      const activeConns = activeScenario.connections || [];
                      const stepMap = new Map<string, ScenarioStep>();
                      activeScenario.steps.forEach((s) => stepMap.set(s.id, s));

                      return activeScenario.steps.map((step, idx) => {
                        const isPickingThis = activePickingLabel?.includes(step.name);
                        const stepTemplates = step.templates && step.templates.length > 0 ? step.templates : (step.template_name ? [step.template_name] : []);

                        let isStepRunning = false;
                        if (execState && execState.is_running) {
                          if (execState.active_step_ids && execState.active_step_ids.includes(step.id)) {
                            isStepRunning = true;
                          } else if (execState.current_step_id === step.id) {
                            isStepRunning = true;
                          }
                        }
                        if (testingStepId === step.id) {
                          isStepRunning = true;
                        }

                        let runningRep = 1;
                        if (execState && execState.current_step_id === step.id) {
                          runningRep = execState.current_rep;
                        }
                        const totalReps = step.repeat_count ?? 1;
                        let runningCycle = 1;
                        if (execState && execState.current_cycle) {
                          runningCycle = execState.current_cycle;
                        }
                        const totalCycles = activeScenario.loop_count ?? 1;
                        const pos = getNodePos(step, idx);

                        // Tính toán xem cổng nào của card này đang có dây nối vào/ra:
                        const hasPort = (direction: 'in' | 'out', side: string) => activeConns.some((c, index) => {
                          const route = routedConnections.get(connectionKey(c,index));
                          return direction === 'in' ? c.to_id === step.id && route?.targetSide === side : c.from_id === step.id && route?.sourceSide === side;
                        });
                        const hasLeftIn = hasPort('in','left');
                        const hasTopIn = hasPort('in','top');
                        const hasRightIn = hasPort('in','right');
                        const hasLeftOut = hasPort('out','left');
                        const hasRightOut = hasPort('out','right');
                        const hasBottomOut = hasPort('out','bottom');

                        // Tự động hoán đổi vị trí nút CÓ / KHÔNG dựa theo vị trí tương đối của card đích để dây chạy thẳng hàng nhất:
                        // Mặc định: CÓ ở x=60 (trái), KHÔNG ở x=180 (phải)
                        // Nếu nhánh CÓ nối sang card nằm bên phải hơn so với card của nhánh KHÔNG => Tự động cho KHÔNG ở x=60, CÓ ở x=180
                        const trueConn = activeConns.find((c) => c.from_id === step.id && c.branch === 'true');
                        const falseConn = activeConns.find((c) => c.from_id === step.id && c.branch === 'false');
                        let swapCoKhong = false;
                        if (trueConn && falseConn) {
                          const targetTrue = stepMap.get(trueConn.to_id);
                          const targetFalse = stepMap.get(falseConn.to_id);
                          if (targetTrue && targetFalse) {
                            const pTrue = getNodePos(targetTrue, activeScenario.steps.indexOf(targetTrue));
                            const pFalse = getNodePos(targetFalse, activeScenario.steps.indexOf(targetFalse));
                            if (pTrue.x > pFalse.x) {
                              swapCoKhong = true;
                            }
                          }
                        } else if (trueConn && !falseConn) {
                          const targetTrue = stepMap.get(trueConn.to_id);
                          if (targetTrue) {
                            const pTrue = getNodePos(targetTrue, activeScenario.steps.indexOf(targetTrue));
                            if (pTrue.x > pos.x + 120) {
                              swapCoKhong = true;
                            }
                          }
                        } else if (!trueConn && falseConn) {
                          const targetFalse = stepMap.get(falseConn.to_id);
                          if (targetFalse) {
                            const pFalse = getNodePos(targetFalse, activeScenario.steps.indexOf(targetFalse));
                            if (pFalse.x < pos.x + 60) {
                              swapCoKhong = true;
                            }
                          }
                        }

                        let nodeBorderColor = '#38bdf8';
                      let nodeBgColor = '#0f172a';
                      let nodeBadgeBg = '#0369a1';
                      let nodeIcon = '⚡';
                      let nodeTypeLabel = 'Hành động';

                      if (step.type === 'if_template') {
                        nodeBorderColor = '#eab308';
                        nodeBgColor = '#261603';
                        nodeBadgeBg = '#854d0e';
                        nodeIcon = '❓';
                        nodeTypeLabel = 'Kiểm Tra Ảnh (If/Else)';
                      } else if (step.type === 'click_matched') {
                        nodeBorderColor = '#06b6d4';
                        nodeBgColor = '#04212a';
                        nodeBadgeBg = '#0e7490';
                        nodeIcon = '👆';
                        nodeTypeLabel = 'Bấm Ảnh Đã Tìm';
                      } else if (step.type === 'key_back') {
                        nodeBorderColor = '#fb7185';
                        nodeBgColor = '#380b1b';
                        nodeBadgeBg = '#f43f5e';
                        nodeIcon = '🔙';
                        nodeTypeLabel = 'Phím Trở Về';
                      } else if (step.type === 'template_tap') {
                        nodeBorderColor = '#f59e0b';
                        nodeBgColor = '#241403';
                        nodeBadgeBg = '#78350f';
                        nodeIcon = '📸';
                        nodeTypeLabel = 'Tìm & Bấm Luôn';
                      } else if (step.type === 'tap') {
                        nodeBorderColor = '#10b981';
                        nodeBgColor = '#062319';
                        nodeBadgeBg = '#064e3b';
                        nodeIcon = '👆';
                        nodeTypeLabel = 'Nhấn Tọa Độ';
                      } else if (step.type === 'swipe') {
                        nodeBorderColor = '#a855f7';
                        nodeBgColor = '#1e0d30';
                        nodeBadgeBg = '#701a75';
                        nodeIcon = '↔️';
                        nodeTypeLabel = 'Vuốt Màn Hình';
                      } else if (step.type === 'delay') {
                        nodeBorderColor = '#94a3b8';
                        nodeBgColor = '#131b2e';
                        nodeBadgeBg = '#1f2937';
                        nodeIcon = '⏳';
                        nodeTypeLabel = 'Chờ Đợi';
                      } else if (step.type === 'run_scenario') {
                        nodeBorderColor = '#6366f1';
                        nodeBgColor = '#131633';
                        nodeBadgeBg = '#1e1b4b';
                        nodeIcon = '📦';
                        nodeTypeLabel = 'Kịch Bản Con';
                      } else if (step.type === 'loop') {
                        nodeBorderColor = '#d946ef';
                        nodeBgColor = '#1f0d2c';
                        nodeBadgeBg = '#831843';
                        nodeIcon = '🔁';
                        nodeTypeLabel = 'Vòng Lặp';
                      } else if (step.type === 'finish') {
                        const isSuccess = (step.finish_status ?? 'success') === 'success';
                        nodeBorderColor = isSuccess ? '#10b981' : '#ef4444';
                        nodeBgColor     = isSuccess ? '#022c22' : '#2a0a0a';
                        nodeBadgeBg     = isSuccess ? '#065f46' : '#7f1d1d';
                        nodeIcon        = isSuccess ? '🏁' : '🛑';
                        nodeTypeLabel   = isSuccess ? 'Dừng & Thành Công' : 'Dừng & Thất Bại';
                      }

                      let cardBg = nodeBgColor;
                      if (isStepRunning) {
                        cardBg = '#032338';
                      } else if (isPickingThis) {
                        cardBg = '#3b2505';
                      }

                      let cardBorder = `1px solid ${nodeBorderColor}`;
                      if (isStepRunning) {
                        cardBorder = '2.5px solid #00f0ff';
                      } else if (isPickingThis) {
                        cardBorder = '2px solid #f59e0b';
                      } else if (connectingFromId && connectingFromId !== step.id) {
                        cardBorder = '2px dashed #22c55e';
                      }

                      let cardBoxShadow = '0 4px 12px rgba(0, 0, 0, 0.45)';
                      if (isStepRunning) {
                        cardBoxShadow = '0 0 25px #00f0ff, 0 0 50px rgba(0, 240, 255, 0.8), inset 0 0 15px rgba(0, 240, 255, 0.4)';
                      } else if (draggedNodeId === step.id) {
                        cardBoxShadow = '0 8px 24px rgba(56, 189, 248, 0.4)';
                      }

                      let cardAnimation = 'none';
                      if (isStepRunning) {
                        cardAnimation = 'runningGlowPulse 1.2s infinite ease-in-out';
                      }

                      return (
                        <div
                          key={step.id}
                          onMouseDown={(e) => {
                            if (e.button === 0 && !connectingFromId) {
                              const viewport = canvasViewportRef.current;
                              if (viewport) panStateRef.current = { pointerX: e.clientX, pointerY: e.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
                            }
                            handleNodeMouseDown(e, step.id, pos);
                          }}
                          onMouseUp={(e) => {
                            if (connectingFromId && connectingFromId !== step.id) {
                              handleEndConnect(e, step.id);
                            }
                          }}
                          onClick={() => {
                            if (dragMoveDistance.current > 5) return;
                            if (connectingFromId && connectingFromId !== step.id) {
                              handleAddConnection(connectingFromId, step.id, connectingBranch);
                              return;
                            }
                            setEditingStepId(step.id);
                          }}
                          style={{
                            position: 'absolute',
                            left: pos.x,
                            top: pos.y,
                            width: 244,
                            minHeight: 172,
                            height: 172,
                            boxSizing: 'border-box',
                            background: cardBg,
                            border: cardBorder,
                            boxShadow: cardBoxShadow,
                            animation: cardAnimation,
                            borderRadius: 8,
                            padding: '8px 10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            cursor: connectingFromId && connectingFromId !== step.id ? 'pointer' : draggedNodeId === step.id ? 'grabbing' : 'grab',
                            transform: 'none',
                            transition: draggedNodeId === step.id ? 'none' : 'box-shadow 0.18s ease-in-out, transform 0.18s ease-in-out',
                            userSelect: 'none',
                            zIndex: isStepRunning ? 90 : draggedNodeId === step.id ? 99 : 2,
                          }}
                          title="Nhấp giữ chuột để kéo thả vị trí tùy ý. Nhấn vào để mở cấu hình chi tiết."
                        >
                          {/* Cổng Vào (IN Bên Trái) - Nhận mũi tên từ Card bên trái */}
                          {(hasLeftIn || connectingFromId) && (
                            <div
                              onMouseUp={(e) => handleEndConnect(e, step.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: 11,
                                height: 11,
                                borderRadius: '50%',
                                background: connectingFromId && connectingFromId !== step.id ? '#38bdf8' : '#0284c7',
                                border: '1.5px solid #020617',
                                position: 'absolute',
                                top: '50%',
                                left: -5.5,
                                transform: 'translateY(-50%)',
                                cursor: connectingFromId ? 'pointer' : 'default',
                                boxShadow: connectingFromId && connectingFromId !== step.id ? '0 0 10px #38bdf8' : '0 0 5px #0284c7',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 7,
                                color: '#fff',
                                fontWeight: 900,
                                zIndex: 10,
                              }}
                              title="🔵 CỔNG VÀO HÔNG (IN): Nhả chuột vào đây để nối từ Card bên trái"
                            >
                              ▶
                            </div>
                          )}

                          {/* Cổng Vào (IN Trên Đỉnh) - Nhận mũi tên từ Card phía trên */}
                          {(hasTopIn || connectingFromId) && (
                            <div
                              onMouseUp={(e) => handleEndConnect(e, step.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: 11,
                                height: 11,
                                borderRadius: '50%',
                                background: connectingFromId && connectingFromId !== step.id ? '#38bdf8' : '#0284c7',
                                border: '1.5px solid #020617',
                                position: 'absolute',
                                top: -5.5,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                cursor: connectingFromId ? 'pointer' : 'default',
                                boxShadow: connectingFromId && connectingFromId !== step.id ? '0 0 10px #38bdf8' : '0 0 5px #0284c7',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 7,
                                color: '#fff',
                                fontWeight: 900,
                                zIndex: 10,
                              }}
                              title="🔵 CỔNG VÀO TRÊN (IN): Nhả chuột vào đây để nối từ Card phía trên"
                            >
                              ▼
                            </div>
                          )}

                          {/* Cổng Vào (IN Bên Phải) - Nhận mũi tên từ Card bên phải hoặc vòng lặp ngược lên */}
                          {(hasRightIn || connectingFromId) && (
                            <div
                              onMouseUp={(e) => handleEndConnect(e, step.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: 11,
                                height: 11,
                                borderRadius: '50%',
                                background: connectingFromId && connectingFromId !== step.id ? '#38bdf8' : '#0284c7',
                                border: '1.5px solid #020617',
                                position: 'absolute',
                                top: '50%',
                                right: -5.5,
                                transform: 'translateY(-50%)',
                                cursor: connectingFromId ? 'pointer' : 'default',
                                boxShadow: connectingFromId && connectingFromId !== step.id ? '0 0 10px #38bdf8' : '0 0 5px #0284c7',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 7,
                                color: '#fff',
                                fontWeight: 900,
                                zIndex: 10,
                              }}
                              title="🔵 CỔNG VÀO HÔNG PHẢI (IN): Nhả chuột vào đây để nối từ Card bên phải"
                            >
                              ◀
                            </div>
                          )}

                          {/* Cổng Ra (OUT): Với If/Else & Kịch Bản Con đặt 2 CỔNG THÀNH CÔNG / THẤT BẠI (CÓ / KHÔNG) Ở MÉP DƯỚI CARD. Với bước Finish thì KHÔNG có cổng ra. */}
                          {step.type === 'finish' ? null : (step.type === 'if_template' || step.type === 'run_scenario') ? (() => {
                            let trueLabel = 'CÓ';
                            let falseLabel = 'KHÔNG';
                            if (step.type === 'run_scenario') {
                              trueLabel = 'THÀNH CÔNG';
                              falseLabel = 'THẤT BẠI';
                            }
                            const isTrueActive = connectingFromId === step.id && connectingBranch === 'true';
                            const isFalseActive = connectingFromId === step.id && connectingBranch === 'false';

                            let trueBg = '#14532d';
                            let trueBorder = '1.5px solid #22c55e';
                            let trueColor = '#86efac';
                            let trueShadow = '0 0 8px rgba(34, 197, 94, 0.7)';
                            if (isTrueActive) {
                              trueBg = '#b45309';
                              trueBorder = '2px solid #f59e0b';
                              trueColor = '#ffffff';
                              trueShadow = '0 0 14px #f59e0b';
                            }

                            let falseBg = '#450a0a';
                            let falseBorder = '1.5px solid #f43f5e';
                            let falseColor = '#fca5a5';
                            let falseShadow = '0 0 8px rgba(244, 63, 94, 0.7)';
                            if (isFalseActive) {
                              falseBg = '#b45309';
                              falseBorder = '2px solid #f59e0b';
                              falseColor = '#ffffff';
                              falseShadow = '0 0 14px #f59e0b';
                            }

                            return (
                              <>
                                {/* Cổng CÓ / THÀNH CÔNG (True) - Tự động linh hoạt nằm trái hoặc phải */}
                                <div
                                  onMouseDown={(e) => handleStartConnect(e, step.id, 'true')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isTrueActive) {
                                      setConnectingFrom(null);
                                    } else if (!connectingFromId) {
                                      handleStartConnect(e, step.id, 'true');
                                    }
                                  }}
                                  style={{
                                    position: 'absolute',
                                    bottom: -10,
                                    left: swapCoKhong ? 180 : 60,
                                    transform: 'translateX(-50%)',
                                    height: 20,
                                    padding: '0 8px',
                                    borderRadius: 10,
                                    background: trueBg,
                                    border: trueBorder,
                                    color: trueColor,
                                    cursor: 'crosshair',
                                    boxShadow: trueShadow,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 10,
                                    fontWeight: 900,
                                    zIndex: 20,
                                    userSelect: 'none',
                                  }}
                                  title={step.type === 'run_scenario' ? "🟢 CỔNG THÀNH CÔNG: Kéo chuột sang bước kế tiếp khi KỊCH BẢN CON THÀNH CÔNG" : "🟢 CỔNG CÓ (ĐÚNG): Kéo chuột sang bước kế tiếp khi TÌM THẤY ẢNH"}
                                >
                                  <span style={{ fontSize: 9 }}>✔</span>
                                  <span>{trueLabel}</span>
                                </div>

                                {/* Cổng KHÔNG / THẤT BẠI (False) - Tự động linh hoạt nằm trái hoặc phải */}
                                <div
                                  onMouseDown={(e) => handleStartConnect(e, step.id, 'false')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isFalseActive) {
                                      setConnectingFrom(null);
                                    } else if (!connectingFromId) {
                                      handleStartConnect(e, step.id, 'false');
                                    }
                                  }}
                                  style={{
                                    position: 'absolute',
                                    bottom: -10,
                                    left: swapCoKhong ? 60 : 180,
                                    transform: 'translateX(-50%)',
                                    height: 20,
                                    padding: '0 8px',
                                    borderRadius: 10,
                                    background: falseBg,
                                    border: falseBorder,
                                    color: falseColor,
                                    cursor: 'crosshair',
                                    boxShadow: falseShadow,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 10,
                                    fontWeight: 900,
                                    zIndex: 20,
                                    userSelect: 'none',
                                  }}
                                  title={step.type === 'run_scenario' ? "🔴 CỔNG THẤT BẠI: Kéo chuột sang bước kế tiếp khi KỊCH BẢN CON THẤT BẠI" : "🔴 CỔNG KHÔNG (SAI): Kéo chuột sang bước kế tiếp khi KHÔNG TÌM THẤY ẢNH"}
                                >
                                  <span style={{ fontSize: 9 }}>✖</span>
                                  <span>{falseLabel}</span>
                                </div>
                              </>
                            );
                          })() : (
                            <>
                              {/* Cổng Ra thông thường bên phải (OUT Phải) */}
                              {(hasLeftOut) && (
                                <div
                                  onMouseDown={(e) => handleStartConnect(e, step.id, 'default')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (connectingFromId === step.id) {
                                      setConnectingFrom(null);
                                    } else {
                                      handleStartConnect(e, step.id, 'default');
                                    }
                                  }}
                                  style={{
                                    width: 11,
                                    height: 11,
                                    borderRadius: '50%',
                                    background: connectingFromId === step.id ? '#f59e0b' : '#38bdf8',
                                    border: '1.5px solid #020617',
                                    position: 'absolute',
                                    top: '50%',
                                    left: -5.5,
                                    transform: 'translateY(-50%)',
                                    cursor: 'crosshair',
                                    boxShadow: connectingFromId === step.id ? '0 0 10px #f59e0b' : '0 0 6px #38bdf8',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 8,
                                    color: '#000',
                                    fontWeight: 900,
                                    zIndex: 10,
                                  }}
                                  title="🔵 CỔNG RA TRÁI (OUT): Kéo chuột từ đây để nối mũi tên sang Card bên trái"
                                >
                                  +
                                </div>
                              )}

                              {(hasRightOut || connectingFromId === step.id || (!hasBottomOut && !hasLeftOut)) && (
                                <div
                                  onMouseDown={(e) => handleStartConnect(e, step.id, 'default')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (connectingFromId === step.id) {
                                      setConnectingFrom(null);
                                    } else {
                                      handleStartConnect(e, step.id, 'default');
                                    }
                                  }}
                                  style={{
                                    width: 11,
                                    height: 11,
                                    borderRadius: '50%',
                                    background: connectingFromId === step.id ? '#f59e0b' : '#38bdf8',
                                    border: '1.5px solid #020617',
                                    position: 'absolute',
                                    top: '50%',
                                    right: -5.5,
                                    transform: 'translateY(-50%)',
                                    cursor: 'crosshair',
                                    boxShadow: connectingFromId === step.id ? '0 0 10px #f59e0b' : '0 0 6px #38bdf8',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 8,
                                    color: '#000',
                                    fontWeight: 900,
                                    zIndex: 10,
                                  }}
                                  title="🔵 CỔNG RA PHẢI (OUT): Kéo chuột từ đây để nối mũi tên sang Card bên phải"
                                >
                                  +
                                </div>
                              )}

                              {/* Cổng Ra thông thường mép dưới (OUT Dưới) */}
                              {(hasBottomOut || connectingFromId === step.id || (!hasRightOut && !hasLeftOut)) && (
                                <div
                                  onMouseDown={(e) => handleStartConnect(e, step.id, 'default')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (connectingFromId === step.id) {
                                      setConnectingFrom(null);
                                    } else {
                                      handleStartConnect(e, step.id, 'default');
                                    }
                                  }}
                                  style={{
                                    width: 11,
                                    height: 11,
                                    borderRadius: '50%',
                                    background: connectingFromId === step.id ? '#f59e0b' : '#38bdf8',
                                    border: '1.5px solid #020617',
                                    position: 'absolute',
                                    bottom: -5.5,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    cursor: 'crosshair',
                                    boxShadow: connectingFromId === step.id ? '0 0 10px #f59e0b' : '0 0 6px #38bdf8',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 8,
                                    color: '#000',
                                    fontWeight: 900,
                                    zIndex: 10,
                                  }}
                                  title="🔵 CỔNG RA DƯỚI (OUT): Kéo chuột từ đây để nối mũi tên xuống Card bên dưới"
                                >
                                  +
                                </div>
                              )}
                            </>
                          )}

                          {/* Node Header: Title ở hàng trên, các nút chức năng ở hàng dưới thoáng đãng */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 5, flexShrink: 0 }}>
                            {/* Hàng trên: Type & Icon & STT căn giữa thanh thoát */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                              <span style={{ cursor: 'grab', color: '#64748b', fontSize: 13, position: 'absolute', left: 0 }} title="Kéo thả vị trí tùy ý">⠿</span>
                              <span
                                style={{
                                  background: isStepRunning ? '#0284c7' : nodeBadgeBg,
                                  color: '#ffffff',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  border: `1px solid ${nodeBorderColor}`,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  maxWidth: '85%',
                                }}
                                title={`#${idx + 1} ${nodeTypeLabel}`}
                              >
                                #{idx + 1} {nodeIcon} {nodeTypeLabel}
                              </span>
                            </div>

                            {/* Hàng dưới: Cụm button hành động căn giữa, khoảng cách thoáng dễ bấm */}
                            <div
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => handleRunUntilStep(step.id)}
                                disabled={Boolean(execState?.is_running)}
                                style={{
                                  minWidth: 28,
                                  height: 26,
                                  padding: '2px 6px',
                                  fontSize: 11,
                                  background: '#1e293b',
                                  color: '#fbbf24',
                                  border: '1px solid #d97706',
                                  borderRadius: 4,
                                  cursor: Boolean(execState?.is_running) ? 'not-allowed' : 'pointer',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease',
                                }}
                                title="🚩 CHẠY TỪ ĐẦU TỚI BƯỚC NÀY: Kịch bản sẽ chạy từ bước đầu tiên theo sơ đồ cho tới khi hoàn tất bước này thì dừng lại"
                              >
                                🚩
                              </button>
                              <button
                                type="button"
                                onClick={() => handleTestSingleStep(step)}
                                disabled={testingStepId === step.id}
                                style={{
                                  minWidth: 28,
                                  height: 26,
                                  padding: '2px 6px',
                                  fontSize: 11,
                                  background: isStepRunning ? '#0284c7' : '#312e81',
                                  color: '#c7d2fe',
                                  border: '1px solid #6366f1',
                                  borderRadius: 4,
                                  cursor: testingStepId === step.id ? 'not-allowed' : 'pointer',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease',
                                }}
                                title="Chạy thử riêng lẻ duy nhất hành động này"
                              >
                                {testingStepId === step.id ? '⏳' : '▶'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingStepId(step.id)}
                                style={{
                                  minWidth: 28,
                                  height: 26,
                                  padding: '2px 6px',
                                  fontSize: 11,
                                  background: '#1e293b',
                                  color: '#38bdf8',
                                  border: '1px solid #334155',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease',
                                }}
                                title="Cấu hình chi tiết"
                              >
                                ⚙️
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteStep(step.id)}
                                style={{
                                  minWidth: 28,
                                  height: 26,
                                  padding: '2px 6px',
                                  fontSize: 11,
                                  background: '#450a0a',
                                  color: '#f87171',
                                  border: '1px solid #dc2626',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease',
                                }}
                                title="Xóa bước này"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Node Title: Căn giữa thanh lịch và gọn gàng */}
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 12,
                              color: '#f1f5f9',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              flexShrink: 0,
                              lineHeight: '18px',
                              height: 18,
                              textAlign: 'center',
                              width: '100%',
                            }}
                            title={step.name}
                          >
                            {step.name}
                          </div>

                          {/* Hiệu ứng visual hiển thị ĐANG CHẠY LẦN X/Y */}
                          {isStepRunning && (() => {
                            let badgeBg = 'linear-gradient(90deg, #0284c7 0%, #0369a1 100%)';
                            let badgeText = `ĐANG CHẠY LẦN ${runningRep}/${totalReps}`;
                            if (step.type === 'run_scenario') {
                              badgeBg = 'linear-gradient(90deg, #4338ca 0%, #6366f1 100%)';
                              badgeText = 'ĐANG CHẠY KỊCH BẢN CON...';
                            }
                            return (
                              <div
                                style={{
                                  background: badgeBg,
                                  color: '#ffffff',
                                  padding: '4px 8px',
                                  borderRadius: 8,
                                  fontSize: 10,
                                  fontWeight: 800,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  boxShadow: '0 0 16px rgba(56, 189, 248, 0.9)',
                                }}
                              >
                                <span>⚡</span>
                                <span>{badgeText}</span>
                                {totalCycles > 1 && <span style={{ color: '#fef08a' }}>(Vòng {runningCycle}/{totalCycles})</span>}
                              </div>
                            );
                          })()}

                          {/* Node Content Summary */}
                          <div style={{ fontSize: 11, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0, overflow: 'hidden', flex: 1 }}>
                            {step.repeat_count && step.repeat_count > 1 ? (
                              <div style={{ color: '#f472b6', fontWeight: 700, fontSize: 10 }}>
                                🔁 Lặp lại: {step.repeat_count} lần (nghỉ {step.repeat_delay ?? 0.5}s)
                              </div>
                            ) : null}

                            {step.type === 'key_back' && (
                              <div style={{ color: '#fda4af' }}>
                                Thao tác: <strong>Bấm phím Back/Trở về</strong>
                              </div>
                            )}

                            {step.type === 'if_template' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 1, flexShrink: 0 }}>
                                <div style={{ color: '#fef08a', fontSize: 10, fontWeight: 700, flexShrink: 0, lineHeight: '14px' }}>
                                  ❓ Kiểm tra ảnh trên màn hình:
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                                  {stepTemplates.length > 0 ? (
                                    <>
                                      {stepTemplates.slice(0, 4).map((tpl, tIdx) => (
                                        <img
                                          key={tpl + tIdx}
                                          src={`${apiBase}/api/auto/template/image/${tpl}?t=${refreshImgKey}`}
                                          alt={tpl}
                                          title={tpl}
                                          style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 5,
                                            objectFit: 'contain',
                                            background: '#040711',
                                            border: '1.5px solid #eab308',
                                            flexShrink: 0,
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                                          }}
                                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                        />
                                      ))}
                                      {stepTemplates.length > 4 && (
                                        <span
                                          style={{
                                            fontSize: 11,
                                            color: '#fef08a',
                                            background: '#854d0e',
                                            border: '1px solid #eab308',
                                            borderRadius: 4,
                                            padding: '4px 6px',
                                            fontWeight: 700,
                                          }}
                                          title={`Còn ${stepTemplates.length - 4} ảnh khác`}
                                        >
                                          +{stepTemplates.length - 4}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span style={{ color: '#fde047', fontStyle: 'italic', fontSize: 11 }}>Chưa có ảnh (Bấm ⚙️ để cắt)</span>
                                  )}
                                </div>
                              </div>
                            )}

                            {step.type === 'click_matched' && (
                              <div style={{ color: '#67e8f9', background: '#083344', padding: '6px 8px', borderRadius: 4, border: '1px solid #06b6d4', fontSize: 11 }}>
                                🎯 Bấm vào ảnh vừa tìm thấy từ bước If/Else
                              </div>
                            )}

                            {step.type === 'template_tap' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                                {stepTemplates.length > 0 ? (
                                  <>
                                    {stepTemplates.slice(0, 4).map((tpl, tIdx) => (
                                      <img
                                        key={tpl + tIdx}
                                        src={`${apiBase}/api/auto/template/image/${tpl}?t=${refreshImgKey}`}
                                        alt={tpl}
                                        title={tpl}
                                        style={{
                                          width: 36,
                                          height: 36,
                                          borderRadius: 5,
                                          objectFit: 'contain',
                                          background: '#040711',
                                          border: '1.5px solid #f59e0b',
                                          flexShrink: 0,
                                          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                                        }}
                                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                      />
                                    ))}
                                    {stepTemplates.length > 4 && (
                                      <span
                                        style={{
                                          fontSize: 11,
                                          color: '#fef08a',
                                          background: '#78350f',
                                          border: '1px solid #d97706',
                                          borderRadius: 4,
                                          padding: '4px 6px',
                                          fontWeight: 700,
                                        }}
                                        title={`Còn ${stepTemplates.length - 4} ảnh khác`}
                                      >
                                        +{stepTemplates.length - 4}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span style={{ color: '#f97316', fontStyle: 'italic', fontSize: 11 }}>Chưa có ảnh (Bấm ⚙️ để cắt)</span>
                                )}
                              </div>
                            )}

                            {step.type === 'tap' && (
                              <div style={{ color: '#38bdf8' }}>


                                Tọa độ: <strong>({step.point?.x || 0}, {step.point?.y || 0})</strong>
                              </div>
                            )}

                            {step.type === 'swipe' && (
                              <div style={{ color: '#d8b4fe', fontSize: 10 }}>
                                ({step.swipe_from?.x}, {step.swipe_from?.y}) ➔ ({step.swipe_to?.x}, {step.swipe_to?.y})
                              </div>
                            )}

                            {step.type === 'delay' && (
                              <div style={{ color: '#94a3b8' }}>
                                Chờ nghỉ: <strong>{step.delay_seconds ?? 2} giây</strong>
                              </div>
                            )}

                            {step.type === 'run_scenario' && (
                              <div style={{ color: '#a5b4fc', fontSize: 10 }}>
                                Gọi kịch bản: <strong>{scenarios.find((s) => s.id === step.target_scenario_id)?.name || 'Chưa chọn'}</strong>
                                <div style={{ fontSize: 9, color: '#818cf8', marginTop: 2 }}>
                                  Rẽ nhánh theo kết quả: 🟢 Thành Công / 🔴 Thất Bại
                                </div>
                              </div>
                            )}

                            {step.type === 'finish' && (
                              <div
                                style={{
                                  background: (step.finish_status ?? 'success') === 'success' ? '#064e3b' : '#450a0a',
                                  color: (step.finish_status ?? 'success') === 'success' ? '#a7f3d0' : '#fca5a5',
                                  padding: '5px 8px',
                                  borderRadius: 4,
                                  border: (step.finish_status ?? 'success') === 'success' ? '1px solid #10b981' : '1px solid #ef4444',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {(step.finish_status ?? 'success') === 'success'
                                  ? '✅ DỪNG & BÁO THÀNH CÔNG'
                                  : '❌ DỪNG & BÁO THẤT BẠI'}
                                <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>
                                  Ngắt bỏ toàn bộ các vòng lặp còn lại
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '12px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {activeScenario.steps.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: 13 }}>
                    Kịch bản chưa có hành động nào. Nhấn các nút <strong>+ THÊM HÀNH ĐỘNG</strong> ở trên để tạo quy trình!
                  </div>
                ) : (
                  activeScenario.steps.map((step, idx) => {
                    const isPickingThis = activePickingLabel?.includes(step.name);
                    const isBeingDragged = draggedIdx === idx;
                    const stepTemplates = step.templates && step.templates.length > 0 ? step.templates : (step.template_name ? [step.template_name] : []);
                    let isStepRunning = false;
                    if (execState && execState.is_running) {
                      if (execState.active_step_ids && execState.active_step_ids.includes(step.id)) {
                        isStepRunning = true;
                      } else if (execState.current_step_id === step.id) {
                        isStepRunning = true;
                      }
                    }
                    if (testingStepId === step.id) {
                      isStepRunning = true;
                    }

                    let runningRep = 1;
                    if (execState && execState.current_step_id === step.id) {
                      runningRep = execState.current_rep;
                    }
                    const totalReps = step.repeat_count ?? 1;

                    let listBg = '#0f172a';
                    let listBorder = '1px solid #1e293b';
                    let listBoxShadow = 'none';
                    let listAnimation = 'none';

                    if (isStepRunning) {
                      listBg = '#032338';
                      listBorder = '2px solid #00f0ff';
                      listBoxShadow = '0 0 20px rgba(0, 240, 255, 0.7)';
                      listAnimation = 'runningGlowPulse 1.2s infinite ease-in-out';
                    } else if (isPickingThis) {
                      listBg = '#3b2505';
                      listBorder = '2px solid #f59e0b';
                    } else if (isBeingDragged) {
                      listBorder = '1px dashed #38bdf8';
                    }

                    // CHẾ ĐỘ XEM DANH SÁCH CHI TIẾT (List View đầy đủ các ô nhập liệu)
                    return (
                      <div
                        key={step.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, idx)}
                        style={{
                          background: listBg,
                          border: listBorder,
                          boxShadow: listBoxShadow,
                          animation: listAnimation,
                          opacity: isBeingDragged ? 0.4 : 1,
                          borderRadius: 6,
                          padding: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        {/* Step Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ cursor: 'grab', color: '#64748b', fontSize: 14 }} title="Kéo thả sắp xếp">⠿</span>
                            <span style={{ background: isStepRunning ? '#0284c7' : '#334155', color: '#f8fafc', fontWeight: 800, padding: '2px 6px', borderRadius: 4, fontSize: 10 }}>
                              #{idx + 1}
                            </span>
                            {isStepRunning && (
                              <span
                                style={{
                                  background: 'linear-gradient(90deg, #0284c7 0%, #0369a1 100%)',
                                  color: '#ffffff',
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  fontSize: 10,
                                  fontWeight: 800,
                                  boxShadow: '0 0 10px #38bdf8',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                ⚡ ĐANG CHẠY LẦN {runningRep}/{totalReps}
                              </span>
                            )}
                            <input
                              type="text"
                              value={step.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateActiveScenario((prev) => ({
                                  ...prev,
                                  steps: prev.steps.map((st) => (st.id === step.id ? { ...st, name: val } : st)),
                                }));
                              }}
                              style={{ background: 'transparent', border: 'none', color: '#f8fafc', fontWeight: 700, fontSize: 13, width: 240 }}
                            />
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleTestSingleStep(step)}
                              disabled={testingStepId === step.id}
                              style={{ padding: '3px 8px', fontSize: 11, background: '#312e81', color: '#c7d2fe', border: '1px solid #6366f1', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                            >
                              {testingStepId === step.id ? '⏳...' : '▶ Thử'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveStep(idx, 'up')}
                              disabled={idx === 0}
                              style={{ padding: '3px 6px', fontSize: 11, background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, cursor: 'pointer' }}
                            >
                              ⬆
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveStep(idx, 'down')}
                              disabled={idx === activeScenario.steps.length - 1}
                              style={{ padding: '3px 6px', fontSize: 11, background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, cursor: 'pointer' }}
                            >
                              ⬇
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStep(step.id)}
                              style={{ padding: '3px 6px', fontSize: 11, background: '#450a0a', color: '#f87171', border: '1px solid #dc2626', borderRadius: 4, cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Inline Form Configuration Fields */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: '#cbd5e1' }}>
                          {/* Lặp lại chung cho mọi hành động */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', padding: '4px 8px', borderRadius: 4 }}>
                            <span style={{ color: '#fbcfe8', fontWeight: 600 }}>🔁 Lặp:</span>
                            <input
                              type="number"
                              min={1}
                              max={50}
                              value={step.repeat_count ?? 1}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value) || 1);
                                updateActiveScenario((prev) => ({
                                  ...prev,
                                  steps: prev.steps.map((st) => (st.id === step.id ? { ...st, repeat_count: val } : st)),
                                }));
                              }}
                              style={{ width: 44, padding: '2px 4px', background: '#0b1120', border: '1px solid #db2777', color: '#f472b6', borderRadius: 4, textAlign: 'center', fontWeight: 700 }}
                            />
                            <span>lần</span>
                            {(step.repeat_count ?? 1) > 1 && (
                              <>
                                <span style={{ color: '#94a3b8', marginLeft: 6 }}>Nghỉ:</span>
                                <input
                                  type="number"
                                  step={0.1}
                                  min={0.1}
                                  value={step.repeat_delay ?? 0.5}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) || 0.5;
                                    updateActiveScenario((prev) => ({
                                      ...prev,
                                      steps: prev.steps.map((st) => (st.id === step.id ? { ...st, repeat_delay: val } : st)),
                                    }));
                                  }}
                                  style={{ width: 44, padding: '2px 4px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                                />
                                <span>giây</span>
                              </>
                            )}
                          </div>

                          {step.type === 'key_back' && (
                            <div style={{ color: '#fecdd3', background: '#250810', padding: '6px 10px', borderRadius: 4, border: '1px solid #e11d48' }}>
                              🔙 <strong>Phím Trở Về (Back)</strong>: Gửi nút Back hệ thống để đóng bảng/thoát popup.
                            </div>
                          )}
                          {step.type === 'loop' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#1c1024', padding: '6px 10px', borderRadius: 4, border: '1px solid #701a75' }}>
                              <span style={{ color: '#f472b6', fontWeight: 700 }}>🔁 Lặp lại:</span>
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={step.loop_count ?? 5}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 5;
                                  updateActiveScenario((prev) => ({
                                    ...prev,
                                    steps: prev.steps.map((st) => (st.id === step.id ? { ...st, loop_count: val, max_iterations: val } : st)),
                                  }));
                                }}
                                style={{ width: 50, padding: '2px 4px', background: '#0b1120', border: '1px solid #db2777', color: '#f472b6', borderRadius: 4, textAlign: 'center', fontWeight: 700 }}
                              />
                              <span>lần</span>
                              <span style={{ color: '#94a3b8', marginLeft: 10 }}>Nghỉ:</span>
                              <input
                                type="number"
                                step={0.1}
                                value={step.delay_between ?? 0.8}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0.8;
                                  updateActiveScenario((prev) => ({
                                    ...prev,
                                    steps: prev.steps.map((st) => (st.id === step.id ? { ...st, delay_between: val } : st)),
                                  }));
                                }}
                                style={{ width: 45, padding: '2px 4px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                              />
                              <span>giây</span>
                            </div>
                          )}

                          {step.type === 'tap' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button type="button" onClick={() => setCoordinateStepId(step.id)} style={{ padding: '7px 12px', background: '#0369a1', color: 'white', border: '1px solid #38bdf8', borderRadius: 5, cursor: 'pointer' }}>Chọn trên ảnh chụp (không bấm game)</button>

                              <span>X:</span>
                              <input
                                type="number"
                                value={step.point?.x || 0}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  updateActiveScenario((prev) => ({
                                    ...prev,
                                    steps: prev.steps.map((st) => (st.id === step.id ? { ...st, point: { ...(st.point || { x: 0, y: 0 }), x: val } } : st)),
                                  }));
                                }}
                                style={{ width: 60, padding: '2px 4px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                              />
                              <span>Y:</span>
                              <input
                                type="number"
                                value={step.point?.y || 0}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  updateActiveScenario((prev) => ({
                                    ...prev,
                                    steps: prev.steps.map((st) => (st.id === step.id ? { ...st, point: { ...(st.point || { x: 0, y: 0 }), y: val } } : st)),
                                  }));
                                }}
                                style={{ width: 60, padding: '2px 4px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (isPickingThis) {
                                    onCancelPick();
                                  } else {
                                    onStartPick(step.name, (p) => {
                                      updateActiveScenario((prev) => ({
                                        ...prev,
                                        steps: prev.steps.map((st) => (st.id === step.id ? { ...st, point: p } : st)),
                                      }));
                                    });
                                  }
                                }}
                                style={{ padding: '3px 10px', background: isPickingThis ? '#d97706' : '#0284c7', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              >
                                {isPickingThis ? '🎯 ĐANG CHỌN (HỦY)' : '🎯 GẮN VỊ TRÍ'}
                              </button>
                            </div>
                          )}

                          {step.type === 'template_tap' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ color: '#94a3b8' }}>Ảnh quét:</span>
                                {stepTemplates.map((tpl) => (
                                  <div key={tpl} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#1e293b', padding: '2px 6px', borderRadius: 4, border: '1px solid #334155' }}>
                                    <img
                                      src={`${apiBase}/api/auto/template/image/${tpl}?t=${refreshImgKey}`}
                                      alt=""
                                      style={{ width: 22, height: 22, borderRadius: 3, objectFit: 'contain', background: '#000' }}
                                    />
                                    <span style={{ fontSize: 11, color: '#fde68a' }}>{tpl}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveTemplateFromStep(step.id, tpl)}
                                      style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => handleDirectCropFromGame(step)}
                                  style={{ padding: '3px 8px', background: '#ea580c', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                >
                                  ✂️ Cắt ảnh từ game
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingStepId(step.id)}
                                  style={{ padding: '3px 8px', background: '#0284c7', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                >
                                  🖼️ Thư Viện Ảnh (Xem hình 1 bên)
                                </button>
                              </div>
                            </div>
                          )}

                          {step.type === 'delay' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>Nghỉ chờ:</span>
                              <input
                                type="number"
                                step={0.5}
                                value={step.delay_seconds ?? 2.0}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 1.0;
                                  updateActiveScenario((prev) => ({
                                    ...prev,
                                    steps: prev.steps.map((st) => (st.id === step.id ? { ...st, delay_seconds: val } : st)),
                                  }));
                                }}
                                style={{ width: 60, padding: '2px 4px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                              />
                              <span>giây</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Modal Popup Cấu Hình Chi Tiết Bước (Khi click vào Node n8n hoặc bấm ⚙️) */}
            {editingStepId && activeScenario && (
              (() => {
                const step = activeScenario.steps.find((st) => st.id === editingStepId);
                if (!step) return null;
                const idx = activeScenario.steps.findIndex((st) => st.id === editingStepId);
                const isPickingThis = activePickingLabel?.includes(step.name);
                const stepTemplates = step.templates && step.templates.length > 0 ? step.templates : (step.template_name ? [step.template_name] : []);

                return (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(5, 10, 20, 0.88)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 100,
                      padding: 12,
                    }}
                    onClick={() => setEditingStepId(null)}
                  >
                    <div
                      style={{
                        width: 560,
                        maxWidth: '92vw',
                        maxHeight: '85vh',
                        background: '#0f172a',
                        border: '1px solid #38bdf8',
                        borderRadius: 10,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.7)',
                        overflowY: 'auto',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Modal Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>⚙️</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                            Cấu Hình Chi Tiết: Bước #{idx + 1} ({step.type})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingStepId(null)}
                          style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', padding: 4 }}
                        >
                          ✕
                        </button>
                      </div>

                      {/* Tên bước */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>TÊN HÀNH ĐỘNG:</label>
                        <input
                          type="text"
                          value={step.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateActiveScenario((prev) => ({
                              ...prev,
                              steps: prev.steps.map((st) => (st.id === step.id ? { ...st, name: val } : st)),
                            }));
                          }}
                          style={{
                            background: '#020617',
                            border: '1px solid #334155',
                            color: '#f8fafc',
                            padding: '6px 10px',
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        />
                      </div>

                      {/* Lặp lại hành động này (Cách 1) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#1e293b', borderRadius: 6, border: '1px solid #334155' }}>
                        <span style={{ fontSize: 12, color: '#fbcfe8', fontWeight: 700 }}>🔁 Lặp lại hành động này:</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={step.repeat_count ?? 1}
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value) || 1);
                            updateActiveScenario((prev) => ({
                              ...prev,
                              steps: prev.steps.map((st) => (st.id === step.id ? { ...st, repeat_count: val } : st)),
                            }));
                          }}
                          style={{ width: 55, padding: '3px 6px', background: '#0b1120', border: '1px solid #db2777', color: '#f472b6', borderRadius: 4, textAlign: 'center', fontWeight: 700 }}
                        />
                        <span style={{ fontSize: 12, color: '#fbcfe8' }}>lần</span>

                        {(step.repeat_count ?? 1) > 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>Nghỉ giữa các lần:</span>
                            <input
                              type="number"
                              step={0.1}
                              min={0.1}
                              value={step.repeat_delay ?? 0.5}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0.5;
                                updateActiveScenario((prev) => ({
                                  ...prev,
                                  steps: prev.steps.map((st) => (st.id === step.id ? { ...st, repeat_delay: val } : st)),
                                }));
                              }}
                              style={{ width: 50, padding: '3px 6px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                            />
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>giây</span>
                          </div>
                        )}
                      </div>

                      {/* Phím Trở Về (Android Back / ESC) */}
                      {step.type === 'key_back' && (
                        <div style={{ padding: 12, background: '#250810', borderRadius: 6, border: '1px solid #e11d48', color: '#fecdd3', fontSize: 13, lineHeight: 1.5 }}>
                          🔙 <strong>Phím Trở Về (Android Back / ESC)</strong>: Gửi lệnh nút Back hệ thống để tắt popup, đóng các cửa sổ đang mở hoặc thoát về màn hình chính. Bạn có thể chỉnh <strong>Lặp lại: 5 lần</strong> ở trên để đóng liên tiếp nhiều popup nếu có.
                        </div>
                      )}

                      {/* Chi tiết theo từng loại hành động */}
                      {step.type === 'loop' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#1c1024', padding: 12, borderRadius: 6, border: '1px solid #701a75' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: '#f472b6', fontWeight: 700, fontSize: 13 }}>🔁 Vòng lặp lại X lần</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, color: '#fbcfe8' }}>Số lần:</span>
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={step.loop_count ?? 5}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 5;
                                  updateActiveScenario((prev) => ({
                                    ...prev,
                                    steps: prev.steps.map((st) => (st.id === step.id ? { ...st, loop_count: val, max_iterations: val } : st)),
                                  }));
                                }}
                                style={{ width: 60, padding: '4px', background: '#0b1120', border: '1px solid #db2777', color: '#f472b6', borderRadius: 4, textAlign: 'center', fontWeight: 700 }}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>Nghỉ giữa các lần lặp:</span>
                            <input
                              type="number"
                              step={0.1}
                              value={step.delay_between ?? 0.8}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0.8;
                                updateActiveScenario((prev) => ({
                                  ...prev,
                                  steps: prev.steps.map((st) => (st.id === step.id ? { ...st, delay_between: val } : st)),
                                }));
                              }}
                              style={{ width: 50, padding: '4px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                            />
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>giây</span>
                          </div>
                        </div>
                      )}

                      {(step.type === 'template_tap' || step.type === 'if_template') && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: step.type === 'if_template' ? '#261603' : '#1c1404', padding: 12, borderRadius: 6, border: step.type === 'if_template' ? '1px solid #ca8a04' : '1px solid #78350f' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: step.type === 'if_template' ? '#eab308' : '#f59e0b', fontWeight: 700, fontSize: 13 }}>
                              {step.type === 'if_template' ? '❓ Kiểm Tra Ảnh (If/Else) - Cắt / Chọn Ảnh Mẫu' : '📸 Tìm & Bấm Luôn - Cắt / Chọn Ảnh Mẫu'}
                            </span>
                          </div>

                          {step.type === 'if_template' && (
                            <div style={{ fontSize: 11, color: '#fef08a', background: '#451a03', padding: '6px 10px', borderRadius: 4, border: '1px solid #b45309' }}>
                              🔍 Bước này chỉ quét tìm ảnh. Nếu <strong>TÌM THẤY</strong> ➔ rẽ nhánh <strong>CÓ (True 🟢)</strong>. Nếu <strong>KHÔNG THẤY</strong> ➔ rẽ nhánh <strong>KHÔNG (False 🔴)</strong>.
                            </div>
                          )}

                          {/* Danh sách ảnh mẫu */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {stepTemplates.map((tpl) => (
                              <div key={tpl} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1e293b', padding: '4px 8px', borderRadius: 4, border: '1px solid #334155' }}>
                                <img
                                  src={`${apiBase}/api/auto/template/image/${tpl}?t=${refreshImgKey}`}
                                  alt=""
                                  style={{ width: 28, height: 28, borderRadius: 3, objectFit: 'contain', background: '#000' }}
                                />
                                <span style={{ fontSize: 11, color: '#fef08a' }}>{tpl}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTemplateFromStep(step.id, tpl)}
                                  style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: 2 }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            {stepTemplates.length === 0 && (
                              <span style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>Chưa có ảnh nào gán vào bước này.</span>
                            )}
                          </div>

                          {/* Action Toolbar cắt & nạp ảnh */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid #2e1d05' }}>
                            <button
                              type="button"
                              onClick={() => handleDirectCropFromGame(step)}
                              style={{
                                padding: '6px 12px',
                                background: isPickingThis ? '#d97706' : '#ea580c',
                                border: '1px solid #f97316',
                                color: 'white',
                                borderRadius: 5,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {isPickingThis ? '🎯 ĐANG CHỜ KHOANH VÙNG TRÊN GAME...' : '✂️ KHOANH VÙNG CẮT ẢNH TỪ GAME'}
                            </button>

                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '6px 10px',
                                background: '#047857',
                                color: '#a7f3d0',
                                borderRadius: 5,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              📁 Nạp Ảnh Tải Lên
                              <input
                                type="file"
                                accept="image/png, image/jpeg"
                                style={{ display: 'none' }}
                                onChange={(e) => handleUploadFileForStep(step.id, e)}
                              />
                            </label>

                            {/* Nút mở thư viện ảnh trực quan */}
                            <button
                              type="button"
                              onClick={() => setOpenLibraryStepId(openLibraryStepId === step.id ? null : step.id)}
                              style={{
                                padding: '6px 12px',
                                background: openLibraryStepId === step.id ? '#0369a1' : '#1e293b',
                                border: '1px solid #38bdf8',
                                color: '#38bdf8',
                                borderRadius: 5,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                              title="Mở thư viện ảnh để xem trước hình ảnh 1 bên và chọn"
                            >
                              🖼️ Chọn Từ Thư Viện ({availableTemplates.length} ảnh) {openLibraryStepId === step.id ? '▲ Đóng' : '▼ Xem hình'}
                            </button>
                          </div>

                          {/* BẢNG THƯ VIỆN ẢNH (Hiển thị hình ảnh 1 bên to rõ để người dùng nhìn thấy) */}
                          {openLibraryStepId === step.id && (
                            <div style={{ background: '#020617', border: '1px solid #0284c7', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
                                  🖼️ Thư Viện Ảnh ({availableTemplates.length} ảnh mẫu) - Bấm vào ảnh để thêm vào bước:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setOpenLibraryStepId(null)}
                                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
                                >
                                  ✕ Đóng
                                </button>
                              </div>

                              {availableTemplates.length === 0 ? (
                                <div style={{ color: '#64748b', fontSize: 12, padding: '10px 0', textAlign: 'center', fontStyle: 'italic' }}>
                                  Thư viện chưa có ảnh nào. Hãy dùng nút "✂️ CẮT ẢNH TỪ GAME" hoặc "📁 Nạp Ảnh Tải Lên" để tạo ảnh mẫu!
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                    gap: 8,
                                    maxHeight: 260,
                                    overflowY: 'auto',
                                    paddingRight: 4,
                                  }}
                                >
                                  {availableTemplates.map((t) => {
                                    const isAdded = stepTemplates.includes(t.name);
                                    return (
                                      <div
                                        key={t.name}
                                        onClick={() => handleAddTemplateToStep(step.id, t.name)}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 10,
                                          background: isAdded ? '#0f291e' : '#0f172a',
                                          border: isAdded ? '1px solid #22c55e' : '1px solid #334155',
                                          borderRadius: 6,
                                          padding: 6,
                                          cursor: 'pointer',
                                          transition: 'all 0.15s ease',
                                        }}
                                        title={isAdded ? 'Đã có trong bước' : `Nhấn để thêm '${t.name}' vào bước này`}
                                      >
                                        {/* HÌNH ẢNH HIỂN THỊ 1 BÊN TO RÕ RÀNG */}
                                        <div style={{ width: 50, height: 50, background: '#000000', borderRadius: 4, border: '1px solid #475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                                          <img
                                            src={`${apiBase}/api/auto/template/image/${t.name}?t=${refreshImgKey}`}
                                            alt={t.name}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                          />
                                        </div>

                                        {/* THÔNG TIN & NÚT BÊN CẠNH */}
                                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                          <span style={{ fontSize: 11, fontWeight: 700, color: '#fef08a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {t.name}
                                          </span>
                                          <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                            {(t.size / 1024).toFixed(1)} KB
                                          </span>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                            <span
                                              style={{
                                                fontSize: 10,
                                                fontWeight: 700,
                                                color: isAdded ? '#4ade80' : '#38bdf8',
                                                background: isAdded ? '#14532d' : '#0369a1',
                                                padding: '1px 6px',
                                                borderRadius: 3,
                                              }}
                                            >
                                              {isAdded ? '✓ Đã gán' : '+ Chọn ảnh'}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={(e) => handleDeleteTemplateFile(e, t.name)}
                                              style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 10, padding: 0 }}
                                              title="Xóa vĩnh viễn tệp này khỏi thư viện"
                                            >
                                              🗑️
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Độ khớp tối thiểu:</span>
                            <input
                              type="number"
                              step={0.05}
                              min={0.5}
                              max={1.0}
                              value={step.threshold ?? 0.72}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0.72;
                                updateActiveScenario((prev) => ({
                                  ...prev,
                                  steps: prev.steps.map((st) => (st.id === step.id ? { ...st, threshold: val } : st)),
                                }));
                              }}
                              style={{ width: 55, padding: '3px 6px', background: '#0b1120', border: '1px solid #334155', color: '#22c55e', borderRadius: 4, textAlign: 'center', fontWeight: 700 }}
                            />

                            {step.type === 'template_tap' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>Nghỉ sau khi bấm:</span>
                                <input
                                  type="number"
                                  step={0.1}
                                  min={0.1}
                                  value={step.delay_after ?? 1.0}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) || 1.0;
                                    updateActiveScenario((prev) => ({
                                      ...prev,
                                      steps: prev.steps.map((st) => (st.id === step.id ? { ...st, delay_after: val } : st)),
                                    }));
                                  }}
                                  style={{ width: 50, padding: '3px 6px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                                />
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>giây</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Cấu hình cho bước Bấm Ảnh Đã Tìm (click_matched) */}
                      {step.type === 'click_matched' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#04212a', padding: 12, borderRadius: 6, border: '1px solid #06b6d4' }}>
                          <span style={{ color: '#06b6d4', fontWeight: 700, fontSize: 13 }}>👆 Bấm Vào Ảnh Đã Tìm Thấy</span>
                          <div style={{ fontSize: 12, color: '#a5f3fc', background: '#083344', padding: '6px 10px', borderRadius: 4, border: '1px solid #0e7490' }}>
                            Bước này sẽ bấm trực tiếp vào tọa độ tâm của bức ảnh mà bước kiểm tra trước đó đã phát hiện.
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>CHỌN BƯỚC KIỂM TRA ẢNH NGUỒN:</label>
                            <select
                              value={step.target_match_step_id || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateActiveScenario((prev) => ({
                                  ...prev,
                                  steps: prev.steps.map((st) => (st.id === step.id ? { ...st, target_match_step_id: val } : st)),
                                }));
                              }}
                              style={{ background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', padding: '6px 8px', borderRadius: 4, fontSize: 12 }}
                            >
                              <option value="">(Tự động) Lấy ảnh tìm thấy gần nhất</option>
                              {activeScenario.steps
                                .filter((s) => (s.type === 'if_template' || s.type === 'template_tap') && s.id !== step.id)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name} ({s.type === 'if_template' ? 'Kiểm Tra If/Else' : 'Tìm Ảnh'})
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>Thời gian nghỉ sau khi bấm:</span>
                            <input
                              type="number"
                              step={0.1}
                              min={0.1}
                              value={step.delay_after ?? 1.0}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 1.0;
                                updateActiveScenario((prev) => ({
                                  ...prev,
                                  steps: prev.steps.map((st) => (st.id === step.id ? { ...st, delay_after: val } : st)),
                                }));
                              }}
                              style={{ width: 55, padding: '4px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                            />
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>giây</span>
                          </div>
                        </div>
                      )}

                      {step.type === 'tap' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#041f17', padding: 12, borderRadius: 6, border: '1px solid #064e3b' }}>
                            <button type="button" onClick={() => setCoordinateStepId(step.id)} style={{ padding: '7px 12px', background: '#0369a1', color: 'white', border: '1px solid #38bdf8', borderRadius: 5, cursor: 'pointer' }}>Chọn trên ảnh chụp (không bấm game)</button>

                          <span style={{ color: '#10b981', fontWeight: 700, fontSize: 13 }}>👆 Nhấn Tọa Độ Màn Hình</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 12, color: '#94a3b8' }}>Tọa độ X:</span>
                              <input
                                type="number"
                                value={step.point?.x || 0}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  updateActiveScenario((prev) => ({
                                    ...prev,
                                    steps: prev.steps.map((st) => (st.id === step.id ? { ...st, point: { ...(st.point || { x: 0, y: 0 }), x: val } } : st)),
                                  }));
                                }}
                                style={{ width: 70, padding: '4px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                              />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 12, color: '#94a3b8' }}>Tọa độ Y:</span>
                              <input
                                type="number"
                                value={step.point?.y || 0}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  updateActiveScenario((prev) => ({
                                    ...prev,
                                    steps: prev.steps.map((st) => (st.id === step.id ? { ...st, point: { ...(st.point || { x: 0, y: 0 }), y: val } } : st)),
                                  }));
                                }}
                                style={{ width: 70, padding: '4px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (isPickingThis) {
                                  onCancelPick();
                                } else {
                                  onStartPick(step.name, (p) => {
                                    updateActiveScenario((prev) => ({
                                      ...prev,
                                      steps: prev.steps.map((st) => (st.id === step.id ? { ...st, point: p } : st)),
                                    }));
                                  });
                                }
                              }}
                              style={{ padding: '5px 12px', background: isPickingThis ? '#d97706' : '#0284c7', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              {isPickingThis ? '🎯 ĐANG CHỌN (HỦY)' : '🎯 GẮN VỊ TRÍ TRỰC TIẾP'}
                            </button>
                          </div>
                        </div>
                      )}

                      {step.type === 'swipe' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#1c0c29', padding: 12, borderRadius: 6, border: '1px solid #701a75' }}>
                          <span style={{ color: '#d946ef', fontWeight: 700, fontSize: 13 }}>↔️ Vuốt Màn Hình (Swipe)</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>Từ ({step.swipe_from?.x}, {step.swipe_from?.y})</span>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>➔ Đến ({step.swipe_to?.x}, {step.swipe_to?.y})</span>
                            <button
                              type="button"
                              onClick={() => {
                                onStartPick(step.name + ' (Bắt đầu)', (p1) => {
                                  updateActiveScenario((prev) => ({
                                    ...prev,
                                    steps: prev.steps.map((st) => (st.id === step.id ? { ...st, swipe_from: p1 } : st)),
                                  }));
                                  setTimeout(() => {
                                    onStartPick(step.name + ' (Kết thúc)', (p2) => {
                                      updateActiveScenario((prev) => ({
                                        ...prev,
                                        steps: prev.steps.map((st) => (st.id === step.id ? { ...st, swipe_to: p2 } : st)),
                                      }));
                                    });
                                  }, 500);
                                });
                              }}
                              style={{ padding: '5px 12px', background: '#0284c7', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              🎯 Gắn 2 Điểm Vuốt
                            </button>
                          </div>
                        </div>
                      )}

                      {step.type === 'delay' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111827', padding: 12, borderRadius: 6, border: '1px solid #374151' }}>
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>Thời gian chờ:</span>
                          <input
                            type="number"
                            step={0.5}
                            min={0.1}
                            value={step.delay_seconds ?? 2.0}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 1.0;
                              updateActiveScenario((prev) => ({
                                ...prev,
                                steps: prev.steps.map((st) => (st.id === step.id ? { ...st, delay_seconds: val } : st)),
                              }));
                            }}
                            style={{ width: 60, padding: '4px', background: '#0b1120', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, textAlign: 'center' }}
                          />
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>giây</span>
                        </div>
                      )}

                      {/* Cấu hình Gọi Kịch Bản Con */}
                      {step.type === 'run_scenario' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#131633', padding: 12, borderRadius: 6, border: '1px solid #4338ca' }}>
                          <span style={{ color: '#818cf8', fontWeight: 700, fontSize: 13 }}>📦 Gọi Kịch Bản Con</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>CHỌN KỊCH BẢN CON ĐỂ CHẠY:</label>
                            <select
                              value={step.target_scenario_id || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                let matchedName = step.name;
                                for (const sc of scenarios) {
                                  if (sc.id === val) {
                                    matchedName = sc.name;
                                    break;
                                  }
                                }
                                updateActiveScenario((prev) => ({
                                  ...prev,
                                  steps: prev.steps.map((st) => (st.id === step.id ? { ...st, target_scenario_id: val, name: matchedName } : st)),
                                }));
                              }}
                              style={{ background: '#0b1120', border: '1px solid #334155', color: '#818cf8', padding: '6px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}
                            >
                              <option value="">-- Chọn kịch bản con --</option>
                              {scenarios
                                .filter((s) => s.id !== activeScenario.id)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name} ({s.steps.length} bước)
                                  </option>
                                ))}
                            </select>
                            <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                              * Khi chọn kịch bản con, tên của Card sẽ tự động đồng bộ theo tên kịch bản đó.
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Cấu hình Kết Thúc Kịch Bản */}
                      {step.type === 'finish' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#022c22', padding: 12, borderRadius: 6, border: '1px solid #10b981' }}>
                          <span style={{ color: '#6ee7b7', fontWeight: 700, fontSize: 13 }}>🏁 Kết Thúc Kịch Bản (Break Loop)</span>
                          <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                            Khi luồng chạy đến bước này, kịch bản sẽ <strong>dừng lại ngay lập tức</strong>, không chạy các vòng lặp (loop) tiếp theo, và trả kết quả về cho kịch bản cha (nếu được gọi từ kịch bản khác).
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>TRẠNG THÁI KẾT QUẢ BÁO VỀ:</label>
                            <div style={{ display: 'flex', gap: 16 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#86efac', fontSize: 12, fontWeight: 700 }}>
                                <input
                                  type="radio"
                                  name={`finish_status_${step.id}`}
                                  value="success"
                                  checked={(step.finish_status ?? 'success') === 'success'}
                                  onChange={() => {
                                    updateActiveScenario((prev) => ({
                                      ...prev,
                                      steps: prev.steps.map((st) =>
                                        st.id === step.id ? { ...st, finish_status: 'success', name: '🏁 Dừng & Báo Thành Công' } : st
                                      ),
                                    }));
                                  }}
                                />
                                🟢 Hoàn tất THÀNH CÔNG (Success)
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#fca5a5', fontSize: 12, fontWeight: 700 }}>
                                <input
                                  type="radio"
                                  name={`finish_status_${step.id}`}
                                  value="fail"
                                  checked={step.finish_status === 'fail'}
                                  onChange={() => {
                                    updateActiveScenario((prev) => ({
                                      ...prev,
                                      steps: prev.steps.map((st) =>
                                        st.id === step.id ? { ...st, finish_status: 'fail', name: '🛑 Dừng & Báo Thất Bại' } : st
                                      ),
                                    }));
                                  }}
                                />
                                🔴 Dừng & Báo THẤT BẠI (Fail)
                              </label>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Modal Footer */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 10, borderTop: '1px solid #1e293b' }}>
                        <button
                          type="button"
                          onClick={() => setEditingStepId(null)}
                          style={{
                            padding: '6px 16px',
                            background: '#0284c7',
                            border: '1px solid #38bdf8',
                            color: 'white',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          ✓ Xong & Đóng
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#64748b', fontSize: 13 }}>
            <span>Chưa có kịch bản nào được chọn hoặc tạo.</span>
            <button
              type="button"
              onClick={handleAddScenario}
              style={{
                padding: '8px 16px',
                background: '#0284c7',
                color: '#ffffff',
                border: '1px solid #38bdf8',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + Tạo Kịch Bản Đầu Tiên
            </button>
          </div>
        )}
      </div>

      {/* Toast Notification góc phải dưới màn hình - Tự động mờ dần và ẩn sau 2s */}
      {saveFeedback && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 18px',
            background: saveFeedback.type === 'success'
              ? 'rgba(5, 46, 22, 0.95)'
              : 'rgba(69, 10, 10, 0.95)',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${saveFeedback.type === 'success' ? '#22c55e' : '#ef4444'}`,
            borderRadius: 10,
            boxShadow: saveFeedback.type === 'success'
              ? '0 12px 30px rgba(0, 0, 0, 0.6), 0 0 16px rgba(34, 197, 94, 0.4)'
              : '0 12px 30px rgba(0, 0, 0, 0.6), 0 0 16px rgba(239, 68, 68, 0.4)',
            opacity: isToastFading ? 0 : 1,
            transform: isToastFading ? 'translateY(8px) scale(0.96)' : 'translateY(0) scale(1)',
            transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
            pointerEvents: isToastFading ? 'none' : 'auto',
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: saveFeedback.type === 'success' ? '#16a34a' : '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              color: 'white',
              flexShrink: 0,
            }}
          >
            {saveFeedback.type === 'success' ? '✓' : '✕'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: saveFeedback.type === 'success' ? '#4ade80' : '#f87171',
              }}
            >
              {saveFeedback.title}
            </span>
            <span style={{ fontSize: 11, color: '#cbd5e1' }}>
              {saveFeedback.message}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSaveFeedback(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 0 0 8px',
              marginLeft: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      {coordinateStepId && <CoordinatePicker apiBase={apiBase} serial={selectedSerial} onClose={() => setCoordinateStepId(null)} onSave={point => {
        updateActiveScenario(prev => ({ ...prev, steps: prev.steps.map(step => step.id === coordinateStepId ? { ...step, point } : step) }));
        setCoordinateStepId(null);
      }} />}
      {isProgressMinimized && (
        <button type="button" aria-label="Mở lại tiến trình" onClick={() => { setIsProgressMinimized(false); setIsProgressPopupOpen(true); }} style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 20000, padding: '12px 18px', borderRadius: 9, border: '1px solid #475569', background: '#172554', color: '#e2e8f0', cursor: 'pointer' }}>
          Tiến trình kịch bản · {execState?.is_running ? 'Đang chạy' : 'Đã dừng'}
        </button>
      )}
      {!isProgressMinimized && (isProgressPopupOpen || execState?.is_running || runningScenarioId || testingStepId || runError) && (
        <div
          role="presentation"
          style={{ position: 'fixed', top: 76, right: 12, bottom: 12, zIndex: 20000, width: 'min(440px, calc(100vw - 24px))', pointerEvents: 'none', display: 'flex' }}
        >
          <section role="dialog" aria-modal="false" aria-labelledby="progress-history-title" style={{ pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0b1220', borderLeft: '1px solid #334155', boxShadow: '-20px 0 60px rgba(0,0,0,.55)', color: '#e2e8f0' }}>
            <header style={{ flexShrink: 0, padding: '18px 20px', background: 'linear-gradient(110deg, #172554, #111827)', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 800, letterSpacing: 1.2 }}>LIVE RUN MONITOR</div>
                  <h2 id="progress-history-title" style={{ margin: '5px 0 0', fontSize: 20 }}>Tiến trình kịch bản</h2>
                  <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>{execState?.scenario_name || activeScenario?.name || 'Kịch bản'} · {execState?.is_running ? 'Đang chạy' : 'Đã dừng'}</div>
                </div>
                <button type="button" onClick={() => setIsProgressMinimized(true)} aria-label="Đóng tiến trình" title="Thu nhỏ tiến trình, không dừng kịch bản" style={{ color: '#cbd5e1', background: '#1e293b', border: '1px solid #475569', borderRadius: 7, padding: '7px 11px', cursor: 'pointer' }}>Đóng</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <div style={{ flex: 1, padding: '9px 11px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155' }}><div style={{ color: '#94a3b8', fontSize: 10 }}>VÒNG</div><strong style={{ color: '#fbcfe8' }}>{execState?.current_cycle || 0} / {execState?.total_cycles || 0}</strong></div>
                <div style={{ flex: 1, padding: '9px 11px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155' }}><div style={{ color: '#94a3b8', fontSize: 10 }}>ĐANG CHẠY</div><strong style={{ color: '#7dd3fc', fontSize: 12 }}>{execState?.current_step_name || (runError ? 'Kết nối lỗi' : 'Chờ bước chạy')}</strong></div>
                <div style={{ flex: 1, padding: '9px 11px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155' }}><div style={{ color: '#94a3b8', fontSize: 10 }}>LẦN</div><strong style={{ color: '#fde68a' }}>{execState?.current_rep || 0} / {execState?.total_reps || 0}</strong></div>
              </div>
            </header>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 20px' }}>
              <div style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 800, marginBottom: 12 }}>CÁC BƯỚC ĐÃ CHẠY ({execState?.current_run_steps?.length || 0})</div>
              {execState?.current_run_steps?.length ? [...execState.current_run_steps].map((item: any, index: number) => (
                <article key={`${item.step_id || item.step_name || 'step'}-${item.time || index}-${index}`} style={{ position: 'relative', marginLeft: 8, padding: '0 0 15px 22px', borderLeft: `2px solid ${item.success ? '#16a34a' : '#475569'}` }}>
                  <span style={{ position: 'absolute', left: -7, top: 0, width: 12, height: 12, borderRadius: '50%', background: item.success ? '#22c55e' : '#64748b', boxShadow: item.success ? '0 0 12px rgba(34,197,94,.45)' : 'none' }} />
                  <div style={{ padding: '11px 12px', border: '1px solid #334155', borderRadius: 9, background: '#111c31' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <strong style={{ color: item.success ? '#86efac' : '#fca5a5', fontSize: 13 }}>{item.success ? '✓' : '•'} {item.step_name || item.step_id || `Bước ${index + 1}`}</strong>
                      <span style={{ color: '#94a3b8', fontSize: 10, whiteSpace: 'nowrap' }}>{item.time || ''}</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>Vòng {item.cycle ?? '—'} · {item.step_type || 'action'} · {item.duration_sec != null ? `${item.duration_sec}s` : '—'} · {item.branch_name || item.branch_taken || 'Tiếp tục'}</div>
                    {item.detail && <div style={{ marginTop: 7, fontSize: 12, color: '#cbd5e1', overflowWrap: 'anywhere' }}>{item.detail}</div>}
                  </div>
                </article>
              )) : <div style={{ padding: 22, textAlign: 'center', color: '#94a3b8', border: '1px dashed #334155', borderRadius: 9 }}>{runError || (execState?.is_running ? 'Đang chờ bước đầu tiên...' : 'Chưa có bước chạy nào.')}</div>}
            </div>
            <footer style={{ flexShrink: 0, padding: '12px 18px', borderTop: '1px solid #334155', color: '#64748b', fontSize: 11 }}>Tiến trình cập nhật trực tiếp · Danh sách cuộn dọc</footer>
          </section>
        </div>
      )}

      {/* Modal Báo Cáo Thống Kê Kết Quả Chạy Thử Kịch Bản */}
      {showReportModal && !isProgressPopupOpen && !execState?.is_running && executionReport && (() => {
        let finalBadgeBg     = '#064e3b';
        let finalBadgeBorder = '#10b981';
        let finalBadgeColor  = '#6ee7b7';
        let finalTitle       = '✅ HOÀN TẤT THÀNH CÔNG';

        if (executionReport.final_status === 'failed') {
          finalBadgeBg     = '#450a0a';
          finalBadgeBorder = '#ef4444';
          finalBadgeColor  = '#fca5a5';
          finalTitle       = '❌ CHẠY XONG VỚI CẢNH BÁO / THẤT BẠI';
        } else if (executionReport.final_status === 'stopped') {
          finalBadgeBg     = '#451a03';
          finalBadgeBorder = '#f59e0b';
          finalBadgeColor  = '#fde68a';
          finalTitle       = '⏹ KỊCH BẢN ĐÃ DỪNG';
        }

        let countIfTrue  = 0;
        let countIfFalse = 0;
        const stepsList  = executionReport.steps || [];
        stepsList.forEach((st: any) => {
          if (st.branch_taken === 'true') {
            countIfTrue = countIfTrue + 1;
          } else if (st.branch_taken === 'false') {
            countIfFalse = countIfFalse + 1;
          }
        });

        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(2, 6, 23, 0.82)',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 300,
              padding: 20,
            }}
            onClick={() => setShowReportModal(false)}
          >
            <div
              style={{
                width: '92%',
                maxWidth: 960,
                maxHeight: '90vh',
                background: '#090d16',
                border: '1px solid #334155',
                borderRadius: 12,
                boxShadow: '0 0 35px rgba(0, 0, 0, 0.8), 0 0 15px rgba(99, 102, 241, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div
                style={{
                  padding: '14px 20px',
                  background: 'linear-gradient(90deg, #1e1b4b 0%, #0f172a 100%)',
                  borderBottom: '1px solid #334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>📊</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc', letterSpacing: 0.5 }}>
                      BÁO CÁO KẾT QUẢ CHẠY THỬ KỊCH BẢN
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      Kịch bản: <strong style={{ color: '#38bdf8' }}>{executionReport.scenario_name}</strong>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: '#1e293b',
                    border: '1px solid #475569',
                    color: '#cbd5e1',
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Đóng bảng báo cáo"
                >
                  ✕
                </button>
              </div>

              {/* Body Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* 4 Thẻ Thống Kê Tóm Tắt */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                  {/* Card 1: Kết Quả Cuối Cùng */}
                  <div
                    style={{
                      background: finalBadgeBg,
                      border: `1.5px solid ${finalBadgeBorder}`,
                      borderRadius: 8,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase' }}>
                      🏆 KẾT QUẢ SAU CÙNG
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: finalBadgeColor }}>
                      {finalTitle}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      {executionReport.stop_reason}
                    </div>
                  </div>

                  {/* Card 2: Thời Gian Xử Lý */}
                  <div
                    style={{
                      background: '#0f172a',
                      border: '1.5px solid #38bdf8',
                      borderRadius: 8,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                      ⏱ TỔNG THỜI GIAN CHẠY
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8' }}>
                      {executionReport.total_duration_sec} giây
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      Bắt đầu: {executionReport.start_time} ➔ Xong: {executionReport.end_time}
                    </div>
                  </div>

                  {/* Card 3: Số Bước Đã Qua */}
                  <div
                    style={{
                      background: '#0f172a',
                      border: '1.5px solid #6366f1',
                      borderRadius: 8,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                      🎯 TỔNG BƯỚC ĐÃ ĐI QUA
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#a5b4fc' }}>
                      {executionReport.total_steps} bước
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      <span style={{ color: '#4ade80' }}>✔ Thành công: {executionReport.success_count}</span> | <span style={{ color: '#f87171' }}>✖ Thất bại: {executionReport.failed_count}</span>
                    </div>
                  </div>

                  {/* Card 4: Rẽ Nhánh If/Else */}
                  <div
                    style={{
                      background: '#0f172a',
                      border: '1.5px solid #eab308',
                      borderRadius: 8,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                      🔀 RẼ NHÁNH ĐIỀU KIỆN
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#fde047' }}>
                      {countIfTrue + countIfFalse} lần rẽ
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      <span style={{ color: '#86efac', fontWeight: 700 }}>🟢 CÓ: {countIfTrue}</span> | <span style={{ color: '#fca5a5', fontWeight: 700 }}>🔴 KHÔNG: {countIfFalse}</span>
                    </div>
                  </div>
                </div>

                {/* Bảng Hành Trình Đi Qua Từng Bước */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>👣</span> HÀNH TRÌNH VÀ KẾT QUẢ QUA TỪNG BƯỚC:
                  </div>

                  <div style={{ border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#111827', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
                          <th style={{ padding: '8px 10px', width: 40, textAlign: 'center' }}>#</th>
                          <th style={{ padding: '8px 10px', width: 75 }}>Thời Gian</th>
                          <th style={{ padding: '8px 10px', width: 190 }}>Tên Bước & Loại</th>
                          <th style={{ padding: '8px 10px', width: 100 }}>Kết Quả</th>
                          <th style={{ padding: '8px 10px', width: 125 }}>Rẽ Nhánh If/Else</th>
                          <th style={{ padding: '8px 10px' }}>Chi Tiết Xử Lý</th>
                          <th style={{ padding: '8px 10px', width: 90, textAlign: 'right' }}>Thời Gian</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stepsList.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                              Chưa có bước nào được ghi nhận.
                            </td>
                          </tr>
                        ) : (
                          stepsList.map((st: any, sIdx: number) => {
                            let rowBg = '#090d16';
                            if (sIdx % 2 === 1) {
                              rowBg = '#0d1322';
                            }

                            let resBg     = '#064e3b';
                            let resBorder = '#10b981';
                            let resColor  = '#86efac';
                            let resText   = '✔ Thành công';
                            if (!st.success) {
                              resBg     = '#450a0a';
                              resBorder = '#ef4444';
                              resColor  = '#fca5a5';
                              resText   = '✖ Thất bại';
                            }

                            let branchBg     = '#1e293b';
                            let branchBorder = '#334155';
                            let branchColor  = '#94a3b8';
                            let branchLabel  = '⚪ Tiếp tục';

                            if (st.branch_taken === 'true') {
                              branchBg     = '#14532d';
                              branchBorder = '#22c55e';
                              branchColor  = '#86efac';
                              branchLabel  = '🟢 RẼ CÓ (Đúng)';
                            } else if (st.branch_taken === 'false') {
                              branchBg     = '#450a0a';
                              branchBorder = '#f43f5e';
                              branchColor  = '#fca5a5';
                              branchLabel  = '🔴 RẼ KHÔNG (Sai)';
                            }

                            return (
                              <tr key={`report-step-${sIdx}`} style={{ background: rowBg, borderBottom: '1px solid #1e293b' }}>
                                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, color: '#f8fafc' }}>
                                  {sIdx + 1}
                                </td>
                                <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: 10 }}>
                                  {st.time || '--:--:--'}
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{st.step_name}</div>
                                  <div style={{ fontSize: 9, color: '#64748b' }}>Loại: {st.step_type}</div>
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <span
                                    style={{
                                      background: resBg,
                                      border: `1px solid ${resBorder}`,
                                      color: resColor,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontSize: 9,
                                      fontWeight: 800,
                                    }}
                                  >
                                    {resText}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <span
                                    style={{
                                      background: branchBg,
                                      border: `1px solid ${branchBorder}`,
                                      color: branchColor,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontSize: 9,
                                      fontWeight: 800,
                                    }}
                                  >
                                    {branchLabel}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 10px', color: '#cbd5e1', fontSize: 11 }}>
                                  {st.detail || '---'}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#fde047' }}>
                                  {st.duration_sec}s
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer Modal */}
              <div
                style={{
                  padding: '12px 20px',
                  background: '#090d16',
                  borderTop: '1px solid #1e293b',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #475569',
                    color: '#f8fafc',
                    padding: '6px 16px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Đóng Báo Cáo
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      </div>
    </>
  );
};
