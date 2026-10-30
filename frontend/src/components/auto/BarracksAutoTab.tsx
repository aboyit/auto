import React from 'react';
import type { StudioAutoConfig, Point, StepPoint, TroopTrainConfig } from '../../types';
import { CoordInputRow } from './CoordInputRow';

interface BarracksAutoTabProps {
  config: StudioAutoConfig;
  onChange: (updater: (prev: StudioAutoConfig) => StudioAutoConfig) => void;
  activePickingLabel?: string | null;
  onStartPick: (label: string, onPicked: (p: Point) => void, previousSteps?: StepPoint[]) => void;
  onCancelPick: () => void;
  navigatingLabel?: string | null;
  onTestClick?: (label: string, point: Point) => void;
  onResetCamera?: () => void;
}

export const BarracksAutoTab: React.FC<BarracksAutoTabProps> = ({
  config,
  onChange,
  activePickingLabel,
  onStartPick,
  onCancelPick,
  navigatingLabel,
  onTestClick,
  onResetCamera,
}) => {
  // Lấy cấu hình Kỵ Binh (mặc định nếu chưa có)
  const cavalry: TroopTrainConfig = config.barracks.cavalry || {
    enabled: true,
    step0_collect_btn: { x: 0, y: 0 },
    step1_building_btn: { x: 0, y: 0 },
    step2_menu_btn: { x: 0, y: 0 },
    step3_train_btn: { x: 0, y: 0 },
  };

  const updateCavalry = (updater: (prevCav: TroopTrainConfig) => TroopTrainConfig) => {
    onChange((prev) => {
      const currentCav = prev.barracks.cavalry || {
        enabled: true,
        step0_collect_btn: { x: 0, y: 0 },
        step1_building_btn: { x: 0, y: 0 },
        step2_menu_btn: { x: 0, y: 0 },
        step3_train_btn: { x: 0, y: 0 },
      };
      return {
        ...prev,
        barracks: {
          ...prev.barracks,
          cavalry: updater(currentCav),
        },
      };
    });
  };

  // Chuỗi bước điều hướng khi gắn vị trí Kỵ Binh
  const cavStep1List: StepPoint[] = [
    {
      x: cavalry.step1_building_btn.x,
      y: cavalry.step1_building_btn.y,
      name: 'Bước 1: Nhà Kỵ Binh',
    },
  ];

  const cavStep2List: StepPoint[] = [
    ...cavStep1List,
    {
      x: cavalry.step2_menu_btn.x,
      y: cavalry.step2_menu_btn.y,
      name: 'Bước 2: Menu Huấn Luyện',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cấu hình chung Luyện Binh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#131c31', padding: 12, borderRadius: 8, border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h4 style={{ margin: 0, fontSize: 14, color: '#f8fafc', fontWeight: 700 }}>
            ⚔️ Cấu hình Luyện Binh
          </h4>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={config.barracks.enabled}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  barracks: { ...prev.barracks, enabled: e.target.checked },
                }))
              }
            />
            Bật tính năng
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Chu kỳ luyện (phút):</span>
          <input
            type="number"
            min={1}
            max={180}
            value={config.barracks.interval_minutes}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                barracks: { ...prev.barracks, interval_minutes: Number(e.target.value) || 5 },
              }))
            }
            style={{ width: 65, padding: '3px 6px', background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: 4, fontSize: 12, textAlign: 'center' }}
          />
        </div>
      </div>

      {/* 1. Phần Kỵ Binh (Hoàn thiện trước) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#131c31', padding: 12, borderRadius: 8, border: '1px solid #3b82f6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: 13, color: '#60a5fa', fontWeight: 700 }}>
            🐎 1. Kỵ Binh (Cavalry)
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onResetCamera && (
              <button
                type="button"
                onClick={onResetCamera}
                style={{
                  background: '#1e3a8a',
                  border: '1px solid #38bdf8',
                  color: '#bae6fd',
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Căn lại camera bản đồ về chính giữa trung tâm thành trì nếu map bị lệch"
              >
                🎯 Căn lại góc nhìn Map
              </button>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={cavalry.enabled}
                onChange={(e) =>
                  updateCavalry((prev) => ({ ...prev, enabled: e.target.checked }))
                }
              />
              Bật Kỵ Binh
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CoordInputRow
            label="Bước 0: Icon Kỵ Binh đã đào tạo (Optional)"
            point={cavalry.step0_collect_btn || { x: 0, y: 0 }}
            onUpdate={(p) =>
              updateCavalry((prev) => ({ ...prev, step0_collect_btn: p }))
            }
            activePickingLabel={activePickingLabel}
            onStartPick={onStartPick}
            onCancelPick={onCancelPick}
            navigatingLabel={navigatingLabel}
            onTestClick={onTestClick}
          />

          <CoordInputRow
            label="Bước 1: Nhà Kỵ Binh"
            point={cavalry.step1_building_btn}
            onUpdate={(p) =>
              updateCavalry((prev) => ({ ...prev, step1_building_btn: p }))
            }
            activePickingLabel={activePickingLabel}
            onStartPick={onStartPick}
            onCancelPick={onCancelPick}
            navigatingLabel={navigatingLabel}
            onTestClick={onTestClick}
          />

          <CoordInputRow
            label="Bước 2: Chọn menu Huấn Luyện"
            point={cavalry.step2_menu_btn}
            onUpdate={(p) =>
              updateCavalry((prev) => ({ ...prev, step2_menu_btn: p }))
            }
            activePickingLabel={activePickingLabel}
            onStartPick={onStartPick}
            onCancelPick={onCancelPick}
            navigatingLabel={navigatingLabel}
            previousSteps={cavStep1List}
            onTestClick={onTestClick}
          />

          <CoordInputRow
            label="Bước 3: Chọn Huấn Luyện (Xác nhận)"
            point={cavalry.step3_train_btn}
            onUpdate={(p) =>
              updateCavalry((prev) => ({ ...prev, step3_train_btn: p }))
            }
            activePickingLabel={activePickingLabel}
            onStartPick={onStartPick}
            onCancelPick={onCancelPick}
            navigatingLabel={navigatingLabel}
            previousSteps={cavStep2List}
            onTestClick={onTestClick}
          />
        </div>

        <div style={{ fontSize: 11, color: '#94a3b8', background: '#090d16', padding: 8, borderRadius: 6, lineHeight: 1.5, borderLeft: '3px solid #60a5fa' }}>
          <div>💡 <b>Bước 0 (Tùy chọn):</b> Bấm chọn icon lính Kỵ Binh đã xong trên nóc nhà để thu nhận lính. Nếu chưa có lính hoàn thành hệ thống sẽ tự động bỏ qua.</div>
          <div>⚔️ <b>Bước 1 ➔ 2 ➔ 3:</b> Nhấn vào nhà Kỵ Binh ➔ Chọn menu Huấn Luyện ➔ Nhấn nút Huấn Luyện để luyện đợt lính mới.</div>
        </div>
      </div>

      {/* 2. Phần Bộ Binh (Infantry) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#131c31', padding: 12, borderRadius: 8, border: '1px solid #1e293b', opacity: 0.85 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: 13, color: '#f59e0b', fontWeight: 700 }}>
            🛡️ 2. Bộ Binh (Infantry)
          </h4>
          <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>Đang cấu hình Kỵ Binh trước</span>
        </div>
      </div>

      {/* 3. Phần Cung Thủ (Archers) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#131c31', padding: 12, borderRadius: 8, border: '1px solid #1e293b', opacity: 0.85 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: 13, color: '#10b981', fontWeight: 700 }}>
            🏹 3. Cung Thủ (Archers)
          </h4>
          <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>Đang cấu hình Kỵ Binh trước</span>
        </div>
      </div>
    </div>
  );
};
