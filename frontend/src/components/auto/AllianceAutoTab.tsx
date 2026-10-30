import React from 'react';
import type { StudioAutoConfig, Point, StepPoint } from '../../types';
import { CoordInputRow } from './CoordInputRow';

interface AllianceAutoTabProps {
  config: StudioAutoConfig;
  onChange: (updater: (prev: StudioAutoConfig) => StudioAutoConfig) => void;
  activePickingLabel?: string | null;
  onStartPick: (label: string, onPicked: (p: Point) => void, previousSteps?: StepPoint[]) => void;
  onCancelPick: () => void;
  navigatingLabel?: string | null;
}

export const AllianceAutoTab: React.FC<AllianceAutoTabProps> = ({
  config,
  onChange,
  activePickingLabel,
  onStartPick,
  onCancelPick,
  navigatingLabel,
}) => {
  const step1List: StepPoint[] = [
    {
      x: config.alliance_gift.step1_alliance_btn.x,
      y: config.alliance_gift.step1_alliance_btn.y,
      name: 'Bước 1: Đồng Minh',
    },
  ];

  const step2List: StepPoint[] = [
    ...step1List,
    {
      x: config.alliance_gift.step2_gift_btn.x,
      y: config.alliance_gift.step2_gift_btn.y,
      name: 'Bước 2: Nhấn vào quà tặng đồng minh',
    },
  ];

  // Chạy tới màn hình Quà rồi bấm Bước 4 để ra màn hình Sảnh khi gán Bước 5
  const step4List: StepPoint[] = [
    ...step2List,
    {
      x: config.alliance_gift.step4_back_btn1?.x || 0,
      y: config.alliance_gift.step4_back_btn1?.y || 0,
      name: 'Bước 4: Nút Quay lại lần 1',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Nhom tinh nang: Giup Dong Minh */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#131c31', padding: 12, borderRadius: 8, border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: 13, color: '#38bdf8', fontWeight: 700 }}>
            🤝 1. Giúp Tất Cả Đồng Minh
          </h4>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={config.alliance_help.enabled}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  alliance_help: { ...prev.alliance_help, enabled: e.target.checked },
                }))
              }
            />
            Bật
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Chu kỳ quét (giây):</span>
          <input
            type="number"
            min={3}
            max={300}
            value={config.alliance_help.interval_seconds}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                alliance_help: { ...prev.alliance_help, interval_seconds: Number(e.target.value) || 15 },
              }))
            }
            style={{ width: 70, padding: '3px 6px', background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: 4, fontSize: 12, textAlign: 'center' }}
          />
        </div>

        <CoordInputRow
          label="Nút Giúp Tất Cả"
          point={config.alliance_help.handshake_btn}
          onUpdate={(p) =>
            onChange((prev) => ({
              ...prev,
              alliance_help: { ...prev.alliance_help, handshake_btn: p },
            }))
          }
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
        />
        <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
          * Tự động đối chiếu ảnh mẫu icon trước khi bấm, tránh bấm nhầm vào khung chat.
        </div>
      </div>

      {/* 2. Nhom tinh nang: Nhan Qua Dong Minh (5 buoc) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#131c31', padding: 12, borderRadius: 8, border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: 13, color: '#f59e0b', fontWeight: 700 }}>
            🎁 2. Nhận Quà Đồng Minh (5 Bước)
          </h4>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={config.alliance_gift.enabled}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  alliance_gift: { ...prev.alliance_gift, enabled: e.target.checked },
                }))
              }
            />
            Bật
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Chu kỳ nhận (phút):</span>
          <input
            type="number"
            min={1}
            max={180}
            value={config.alliance_gift.interval_minutes}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                alliance_gift: { ...prev.alliance_gift, interval_minutes: Number(e.target.value) || 15 },
              }))
            }
            style={{ width: 70, padding: '3px 6px', background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: 4, fontSize: 12, textAlign: 'center' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CoordInputRow
            label="Bước 1: Đồng Minh"
            point={config.alliance_gift.step1_alliance_btn}
            onUpdate={(p) =>
              onChange((prev) => ({
                ...prev,
                alliance_gift: { ...prev.alliance_gift, step1_alliance_btn: p },
              }))
            }
            activePickingLabel={activePickingLabel}
            onStartPick={onStartPick}
            onCancelPick={onCancelPick}
            navigatingLabel={navigatingLabel}
          />

          <CoordInputRow
            label="Bước 2: Nhấn vào quà tặng đồng minh"
            point={config.alliance_gift.step2_gift_btn}
            onUpdate={(p) =>
              onChange((prev) => ({
                ...prev,
                alliance_gift: { ...prev.alliance_gift, step2_gift_btn: p },
              }))
            }
            activePickingLabel={activePickingLabel}
            onStartPick={onStartPick}
            onCancelPick={onCancelPick}
            navigatingLabel={navigatingLabel}
            previousSteps={step1List}
          />

          <CoordInputRow
            label="Bước 3: Nhận quà"
            point={config.alliance_gift.step3_claim_btn}
            onUpdate={(p) =>
              onChange((prev) => ({
                ...prev,
                alliance_gift: { ...prev.alliance_gift, step3_claim_btn: p },
              }))
            }
            activePickingLabel={activePickingLabel}
            onStartPick={onStartPick}
            onCancelPick={onCancelPick}
            navigatingLabel={navigatingLabel}
            previousSteps={step2List}
          />

          <CoordInputRow
            label="Bước 4: Nút Quay lại lần 1 (Khi không có quà: Mục Quà ➔ Sảnh)"
            point={config.alliance_gift.step4_back_btn1 || { x: 0, y: 0 }}
            onUpdate={(p) =>
              onChange((prev) => ({
                ...prev,
                alliance_gift: { ...prev.alliance_gift, step4_back_btn1: p },
              }))
            }
            activePickingLabel={activePickingLabel}
            onStartPick={onStartPick}
            onCancelPick={onCancelPick}
            navigatingLabel={navigatingLabel}
            previousSteps={step2List}
          />

          <CoordInputRow
            label="Bước 5: Nút Quay lại lần 2 (Khi không có quà: Sảnh ➔ Màn hình chính)"
            point={config.alliance_gift.step5_back_btn2 || { x: 0, y: 0 }}
            onUpdate={(p) =>
              onChange((prev) => ({
                ...prev,
                alliance_gift: { ...prev.alliance_gift, step5_back_btn2: p },
              }))
            }
            activePickingLabel={activePickingLabel}
            onStartPick={onStartPick}
            onCancelPick={onCancelPick}
            navigatingLabel={navigatingLabel}
            previousSteps={step4List}
          />
        </div>

        <div style={{ fontSize: 11, color: '#94a3b8', background: '#090d16', padding: 8, borderRadius: 6, lineHeight: 1.5, borderLeft: '3px solid #f59e0b' }}>
          <div>🎁 <b>Có quà:</b> Game tự hiện bảng <i>Nhận Thưởng</i>, Auto sẽ tự bấm 1 lần để nhận và trở về thẳng màn hình chính (không bấm Bước 4, 5).</div>
          <div>ℹ️ <b>Không có quà:</b> Auto tự động nhận biết và bấm nút Quay lại 2 lần (Bước 4 & 5) để thoát về màn hình chính.</div>
        </div>
      </div>
    </div>
  );
};
