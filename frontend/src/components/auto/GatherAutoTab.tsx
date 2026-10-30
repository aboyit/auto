import React from 'react';
import type { StudioAutoConfig, Point, StepPoint } from '../../types';
import { CoordInputRow } from './CoordInputRow';

interface GatherAutoTabProps {
  config: StudioAutoConfig;
  onChange: (updater: (prev: StudioAutoConfig) => StudioAutoConfig) => void;
  activePickingLabel?: string | null;
  onStartPick: (label: string, onPicked: (p: Point) => void, previousSteps?: StepPoint[]) => void;
  onCancelPick: () => void;
  navigatingLabel?: string | null;
}

export const GatherAutoTab: React.FC<GatherAutoTabProps> = ({
  config,
  onChange,
  activePickingLabel,
  onStartPick,
  onCancelPick,
  navigatingLabel,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h4 style={{ margin: 0, fontSize: 14, color: '#f8fafc' }}>🌾 Cấu hình Thu Thập (3 Đội)</h4>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={config.gather.enabled}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              gather: { ...prev.gather, enabled: e.target.checked },
            }))
          }
        />
        Bật tự động phái đội thu thập
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>Số đội phái đi:</span>
        <input
          type="number"
          min={1}
          max={5}
          value={config.gather.squad_count}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              gather: { ...prev.gather, squad_count: Number(e.target.value) || 3 },
            }))
          }
          style={{ width: 80, padding: '4px 8px', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', borderRadius: 4, fontSize: 12 }}
        />
      </div>

      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#38bdf8' }}>📍 Gắn Tọa độ Thao Tác Bản Đồ:</div>
        <CoordInputRow
          label="Nút Ra Thế Giới / Xuất Thành"
          point={config.gather.world_map_btn}
          onUpdate={(p) =>
            onChange((prev) => ({ ...prev, gather: { ...prev.gather, world_map_btn: p } }))
          }
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
        />
        <CoordInputRow
          label="Nút Tìm Điểm Tài Nguyên (Kính Lúp)"
          point={config.gather.search_res_btn}
          onUpdate={(p) =>
            onChange((prev) => ({ ...prev, gather: { ...prev.gather, search_res_btn: p } }))
          }
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
          previousSteps={[
            {
              x: config.gather.world_map_btn.x,
              y: config.gather.world_map_btn.y,
              name: 'Nút Ra Thế Giới / Xuất Thành',
            },
          ]}
        />
        <CoordInputRow
          label="Nút Xuất Quân / Phái Đội"
          point={config.gather.dispatch_btn}
          onUpdate={(p) =>
            onChange((prev) => ({ ...prev, gather: { ...prev.gather, dispatch_btn: p } }))
          }
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
          previousSteps={[
            {
              x: config.gather.world_map_btn.x,
              y: config.gather.world_map_btn.y,
              name: 'Nút Ra Thế Giới / Xuất Thành',
            },
            {
              x: config.gather.search_res_btn.x,
              y: config.gather.search_res_btn.y,
              name: 'Nút Tìm Điểm Tài Nguyên (Kính Lúp)',
            },
          ]}
        />
      </div>
    </div>
  );
};
