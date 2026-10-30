import React from 'react';
import type { Point, StepPoint } from '../../types';

interface CoordInputRowProps {
  label: string;
  point: Point;
  onUpdate: (p: Point) => void;
  activePickingLabel?: string | null;
  onStartPick: (label: string, onPicked: (p: Point) => void, previousSteps?: StepPoint[]) => void;
  onCancelPick: () => void;
  previousSteps?: StepPoint[];
  navigatingLabel?: string | null;
  onTestClick?: (label: string, point: Point) => void;
}

export const CoordInputRow: React.FC<CoordInputRowProps> = ({
  label,
  point,
  onUpdate,
  activePickingLabel,
  onStartPick,
  onCancelPick,
  previousSteps,
  navigatingLabel,
  onTestClick,
}) => {
  const isPickingThis = activePickingLabel === label;
  const isNavigatingThis = navigatingLabel === label;

  const handleClick = () => {
    if (isPickingThis) {
      onCancelPick();
      return;
    }

    if (isNavigatingThis) {
      return;
    }

    // Kiểm tra xem các bước trước đã có tọa độ hợp lệ chưa
    if (previousSteps && previousSteps.length > 0) {
      const missingStep = previousSteps.find((s) => s.x <= 0 || s.y <= 0);
      if (missingStep) {
        alert(`Vui lòng gắn vị trí cho "${missingStep.name}" trước khi gắn vị trí cho bước này!`);
        return;
      }
    }

    onStartPick(label, onUpdate, previousSteps);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 10px',
        background: isPickingThis ? '#3b2505' : '#1e293b',
        borderRadius: 6,
        border: isPickingThis ? '1px solid #f59e0b' : '1px solid transparent',
        fontSize: 13,
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: isPickingThis ? '#fef08a' : '#cbd5e1', fontWeight: isPickingThis ? 700 : 500 }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {point.x > 0 && point.y > 0 && onTestClick && (
            <button
              type="button"
              onClick={() => onTestClick(label, point)}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid #6366f1',
                background: '#312e81',
                color: '#c7d2fe',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
              }}
              title={`Bấm thử nút "${label}" trên game để xem phản hồi`}
            >
              ▶ Thử
            </button>
          )}
          <button
            type="button"
            disabled={isNavigatingThis}
            onClick={handleClick}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: 'none',
              background: isPickingThis ? '#d97706' : isNavigatingThis ? '#475569' : '#0284c7',
              color: 'white',
              cursor: isNavigatingThis ? 'not-allowed' : 'pointer',
              fontSize: 11,
              fontWeight: 700,
              boxShadow: isPickingThis ? '0 0 10px #f59e0b' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {isNavigatingThis
              ? '⏳ ĐANG MỞ...'
              : isPickingThis
              ? '🎯 ĐANG CHỌN... (HỦY)'
              : '🎯 GẮN VỊ TRÍ'}
          </button>
        </div>
      </div>

      {previousSteps && previousSteps.length > 0 && (
        <div style={{ fontSize: 11, color: '#38bdf8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>🔗 Tự động chạy {previousSteps.length} bước trước để mở màn hình</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>X:</span>
          <input
            type="number"
            value={point.x}
            onChange={(e) => onUpdate({ ...point, x: Number(e.target.value) || 0 })}
            style={{
              width: 68,
              padding: '3px 6px',
              background: '#0f172a',
              border: '1px solid #334155',
              color: '#38bdf8',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>Y:</span>
          <input
            type="number"
            value={point.y}
            onChange={(e) => onUpdate({ ...point, y: Number(e.target.value) || 0 })}
            style={{
              width: 68,
              padding: '3px 6px',
              background: '#0f172a',
              border: '1px solid #334155',
              color: '#38bdf8',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
            }}
          />
        </div>
      </div>
    </div>
  );
};
