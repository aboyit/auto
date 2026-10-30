import React from 'react';
import type { StudioAutoConfig, Point, StepPoint } from '../../types';
import { CoordInputRow } from './CoordInputRow';

interface GiftAutoTabProps {
  config: StudioAutoConfig;
  onChange: (updater: (prev: StudioAutoConfig) => StudioAutoConfig) => void;
  activePickingLabel?: string | null;
  onStartPick: (label: string, onPicked: (p: Point) => void, previousSteps?: StepPoint[]) => void;
  onCancelPick: () => void;
  navigatingLabel?: string | null;
}

export const GiftAutoTab: React.FC<GiftAutoTabProps> = ({
  config,
  onChange,
  activePickingLabel,
  onStartPick,
  onCancelPick,
  navigatingLabel,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h4 style={{ margin: 0, fontSize: 14, color: '#f8fafc' }}>🎁 Cấu hình Nhận Quà Cư Dân</h4>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={config.citizen_gift.enabled}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              citizen_gift: { ...prev.citizen_gift, enabled: e.target.checked },
            }))
          }
        />
        Bật tự động nhận quà cư dân
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>Chu kỳ kiểm tra (giây):</span>
        <input
          type="number"
          min={10}
          max={600}
          value={config.citizen_gift.interval_seconds}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              citizen_gift: { ...prev.citizen_gift, interval_seconds: Number(e.target.value) || 30 },
            }))
          }
          style={{ width: 80, padding: '4px 8px', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', borderRadius: 4, fontSize: 12 }}
        />
      </div>

      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#38bdf8' }}>📍 Các bước thực hiện:</div>
        <CoordInputRow
          label="Bước 1: Icon Hộp Quà (Thành)"
          point={config.citizen_gift.gift_icon}
          onUpdate={(p) =>
            onChange((prev) => ({ ...prev, citizen_gift: { ...prev.citizen_gift, gift_icon: p } }))
          }
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
        />
        <CoordInputRow
          label="Bước 2: Nhấn vào popup (Ra màn hình chính)"
          point={config.citizen_gift.claim_btn}
          onUpdate={(p) =>
            onChange((prev) => ({ ...prev, citizen_gift: { ...prev.citizen_gift, claim_btn: p } }))
          }
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
          previousSteps={[
            {
              x: config.citizen_gift.gift_icon.x,
              y: config.citizen_gift.gift_icon.y,
              name: 'Bước 1: Icon Hộp Quà (Thành)',
            },
          ]}
        />
        <div style={{ fontSize: 11, color: '#94a3b8', background: '#090d16', padding: 8, borderRadius: 6, lineHeight: 1.5, borderLeft: '3px solid #38bdf8' }}>
          * <b>Bước 1:</b> Nhấn vào Icon Hộp Quà trên màn hình chính trong thành để mở popup thưởng.<br />
          * <b>Bước 2:</b> Nhấn 1 lần vào popup để nhận thưởng và tự động đóng trở về màn hình chính.
        </div>
      </div>
    </div>
  );
};
