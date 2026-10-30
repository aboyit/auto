import React, { useState, useEffect } from 'react';
import type { StudioAutoConfig, Point, StepPoint, CameraResetConfig } from '../../types';
import { CoordInputRow } from './CoordInputRow';

interface CameraResetTabProps {
  config: StudioAutoConfig;
  onChange: (updater: (prev: StudioAutoConfig) => StudioAutoConfig) => void;
  activePickingLabel?: string | null;
  onStartPick: (label: string, onPicked: (p: Point) => void, previousSteps?: StepPoint[]) => void;
  onCancelPick: () => void;
  navigatingLabel?: string | null;
  onTestClick?: (label: string, point: Point) => void;
  onResetCamera?: () => void;
  apiBase?: string;
}

export const CameraResetTab: React.FC<CameraResetTabProps> = ({
  config,
  onChange,
  activePickingLabel,
  onStartPick,
  onCancelPick,
  navigatingLabel,
  onTestClick,
  onResetCamera,
  apiBase,
}) => {
  const baseUrl = apiBase || (window.location.port === '5173' ? 'http://127.0.0.1:8000' : window.location.origin);

  const cameraCfg: CameraResetConfig = config.camera_reset || {
    step1_outside_tap: { x: 360, y: 300 },
    step2_xuat_thanh_btn: { x: 650, y: 1200 },
    step2_xuat_thanh_template: 'btn_xuat_thanh.png',
    step3_vao_thanh_btn: { x: 650, y: 1200 },
    step3_vao_thanh_template: 'btn_vao_thanh.png',
  };

  const [xuatThanhExists, setXuatThanhExists] = useState<boolean>(false);
  const [vaoThanhExists, setVaoThanhExists] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());
  const [croppingTarget, setCroppingTarget] = useState<string | null>(null);

  // Kiểm tra sự tồn tại của file ảnh mẫu từ Backend
  const checkTemplates = async () => {
    try {
      const resXt = await fetch(`${baseUrl}/api/auto/template/info/${cameraCfg.step2_xuat_thanh_template}`);
      if (resXt.ok) {
        const dataXt = await resXt.json();
        setXuatThanhExists(Boolean(dataXt.exists));
      }
      const resVt = await fetch(`${baseUrl}/api/auto/template/info/${cameraCfg.step3_vao_thanh_template}`);
      if (resVt.ok) {
        const dataVt = await resVt.json();
        setVaoThanhExists(Boolean(dataVt.exists));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    checkTemplates();
    const interval = setInterval(checkTemplates, 3000);
    return () => clearInterval(interval);
  }, [baseUrl, refreshKey, cameraCfg.step2_xuat_thanh_template, cameraCfg.step3_vao_thanh_template]);

  const updateCameraCfg = (updater: (prev: CameraResetConfig) => CameraResetConfig) => {
    onChange((prev) => {
      const current = prev.camera_reset || {
        step1_outside_tap: { x: 360, y: 300 },
        step2_xuat_thanh_btn: { x: 650, y: 1200 },
        step2_xuat_thanh_template: 'btn_xuat_thanh.png',
        step3_vao_thanh_btn: { x: 650, y: 1200 },
        step3_vao_thanh_template: 'btn_vao_thanh.png',
      };
      return {
        ...prev,
        camera_reset: updater(current),
      };
    });
  };

  // Hàm thủ công cắt ảnh mẫu tại tọa độ hiện tại
  const handleManualCrop = async (templateName: string, point: Point) => {
    if (point.x <= 0 || point.y <= 0) {
      alert('Vui lòng gắn vị trí tọa độ trước khi cắt ảnh mẫu!');
      return;
    }
    setCroppingTarget(templateName);
    try {
      const resDev = await fetch(`${baseUrl}/api/devices`);
      const devData = await resDev.json();
      const serial = devData && devData.length > 0 ? devData[0].serial : '';
      if (!serial) {
        alert('Chưa kết nối thiết bị!');
        return;
      }
      const res = await fetch(`${baseUrl}/api/auto/template/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial,
          x: point.x,
          y: point.y,
          template_name: templateName,
          radius: 34,
        }),
      });
      if (res.ok) {
        setRefreshKey(Date.now());
        await checkTemplates();
      } else {
        alert('Lỗi cắt ảnh mẫu từ backend');
      }
    } catch (e) {
      alert('Không kết nối được backend để cắt ảnh: ' + String(e));
    } finally {
      setCroppingTarget(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header Giới thiệu tính năng */}
      <div style={{ background: '#131c31', padding: 12, borderRadius: 8, border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h4 style={{ margin: 0, fontSize: 14, color: '#f8fafc', fontWeight: 700 }}>
            🎯 Căn Lại Góc Nhìn Map (Về Trung Tâm Thành Trì)
          </h4>
          {onResetCamera && (
            <button
              type="button"
              onClick={onResetCamera}
              style={{
                background: '#0284c7',
                border: 'none',
                color: 'white',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 10px rgba(2, 132, 199, 0.4)',
              }}
            >
              ▶ THỬ CĂN MAP NGAY (3 BƯỚC)
            </button>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
          Tính năng dùng chung cho toàn bộ các module auto (Luyện Binh, Thu Thập, Sự Kiện...).
          Bao gồm 3 bước chuẩn: <br />
          <strong>1.</strong> Nhấn 1 điểm trống ngoài map để thoát chọn công trình / đóng popup menu dang dở. <br />
          <strong>2.</strong> Nhấn nút <strong>Xuất Thành</strong> (nhận diện theo ảnh mẫu cố định ở góc phải). <br />
          <strong>3.</strong> Nhấn nút <strong>Vào Thành</strong> (nhận diện theo ảnh mẫu cố định ở góc phải) để đưa toàn bộ thành trì về đúng chính giữa tâm màn hình.
        </p>
      </div>

      {/* BƯỚC 1: Nhấn ngoài map */}
      <div style={{ background: '#0b1329', padding: 12, borderRadius: 8, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#38bdf8', color: '#0f172a', fontWeight: 800, padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>BƯỚC 1</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13 }}>Nhấn Ngoài Map (Bỏ chọn / Đóng popup)</span>
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>Chọn vị trí bãi cỏ hoặc khoảng trống không có công trình</span>
        </div>

        <CoordInputRow
          label="Điểm Chạm Ngoài Map"
          point={cameraCfg.step1_outside_tap}
          onUpdate={(pt) => updateCameraCfg((c) => ({ ...c, step1_outside_tap: pt }))}
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
          onTestClick={onTestClick}
        />
      </div>

      {/* BƯỚC 2: Nút Xuất Thành */}
      <div style={{ background: '#0b1329', padding: 12, borderRadius: 8, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#f59e0b', color: '#0f172a', fontWeight: 800, padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>BƯỚC 2</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13 }}>Nút Xuất Thành (Màn hình trong thành)</span>
          </div>
          <span style={{ fontSize: 11, color: '#f59e0b' }}>Nút luôn nằm cố định ở góc phải bên dưới</span>
        </div>

        <CoordInputRow
          label="Nút Xuất Thành (Màn hình trong thành)"
          point={cameraCfg.step2_xuat_thanh_btn}
          onUpdate={(pt) => {
            updateCameraCfg((c) => ({ ...c, step2_xuat_thanh_btn: pt }));
            setTimeout(() => {
              setRefreshKey(Date.now());
              checkTemplates();
            }, 800);
          }}
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
          onTestClick={onTestClick}
        />

        {/* Trạng thái ảnh nhận diện Bước 2 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a', padding: '10px 12px', borderRadius: 6, border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {xuatThanhExists ? (
              <img
                src={`${baseUrl}/api/auto/template/image/${cameraCfg.step2_xuat_thanh_template}?t=${refreshKey}`}
                alt="Mẫu Xuất Thành"
                style={{ width: 44, height: 44, borderRadius: 6, border: '2px solid #22c55e', objectFit: 'contain', background: '#020617' }}
              />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 6, border: '2px dashed #64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#64748b' }}>
                📷
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: xuatThanhExists ? '#22c55e' : '#f59e0b' }}>
                {xuatThanhExists ? '✅ Đã có ảnh mẫu nhận diện Xuất Thành' : '⚠️ Chưa có ảnh mẫu (Bấm GẮN VỊ TRÍ để tự động cắt ảnh)'}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                Tệp: <code style={{ color: '#38bdf8' }}>{cameraCfg.step2_xuat_thanh_template}</code>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={croppingTarget === cameraCfg.step2_xuat_thanh_template}
              onClick={() => handleManualCrop(cameraCfg.step2_xuat_thanh_template, cameraCfg.step2_xuat_thanh_btn)}
              style={{
                padding: '5px 12px',
                borderRadius: 4,
                border: '1px solid #d97706',
                background: '#451a03',
                color: '#fef08a',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Cắt lại ảnh mẫu 68x68 px ngay tại tọa độ đã gán"
            >
              {croppingTarget === cameraCfg.step2_xuat_thanh_template ? '⏳ Đang cắt...' : '📸 Cắt lại ảnh'}
            </button>
            {onTestClick && cameraCfg.step2_xuat_thanh_btn.x > 0 && (
              <button
                type="button"
                onClick={() => onTestClick('Xuất Thành (Test)', cameraCfg.step2_xuat_thanh_btn)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: '1px solid #475569',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ▶ Bấm thử
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BƯỚC 3: Nút Vào Thành */}
      <div style={{ background: '#0b1329', padding: 12, borderRadius: 8, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#10b981', color: '#0f172a', fontWeight: 800, padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>BƯỚC 3</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13 }}>Nút Vào Thành / Thành Trì (Màn hình ngoài map)</span>
          </div>
          <span style={{ fontSize: 11, color: '#10b981' }}>Nút luôn nằm cố định ở góc phải bên dưới ngoài map</span>
        </div>

        <CoordInputRow
          label="Nút Vào Thành (Màn hình ngoài map)"
          point={cameraCfg.step3_vao_thanh_btn}
          onUpdate={(pt) => {
            updateCameraCfg((c) => ({ ...c, step3_vao_thanh_btn: pt }));
            setTimeout(() => {
              setRefreshKey(Date.now());
              checkTemplates();
            }, 800);
          }}
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
          onTestClick={onTestClick}
        />

        {/* Trạng thái ảnh nhận diện Bước 3 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a', padding: '10px 12px', borderRadius: 6, border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {vaoThanhExists ? (
              <img
                src={`${baseUrl}/api/auto/template/image/${cameraCfg.step3_vao_thanh_template}?t=${refreshKey}`}
                alt="Mẫu Vào Thành"
                style={{ width: 44, height: 44, borderRadius: 6, border: '2px solid #22c55e', objectFit: 'contain', background: '#020617' }}
              />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 6, border: '2px dashed #64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#64748b' }}>
                📷
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: vaoThanhExists ? '#22c55e' : '#f59e0b' }}>
                {vaoThanhExists ? '✅ Đã có ảnh mẫu nhận diện Vào Thành' : '⚠️ Chưa có ảnh mẫu (Bấm GẮN VỊ TRÍ để tự động cắt ảnh)'}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                Tệp: <code style={{ color: '#38bdf8' }}>{cameraCfg.step3_vao_thanh_template}</code>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={croppingTarget === cameraCfg.step3_vao_thanh_template}
              onClick={() => handleManualCrop(cameraCfg.step3_vao_thanh_template, cameraCfg.step3_vao_thanh_btn)}
              style={{
                padding: '5px 12px',
                borderRadius: 4,
                border: '1px solid #d97706',
                background: '#451a03',
                color: '#fef08a',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Cắt lại ảnh mẫu 68x68 px ngay tại tọa độ đã gán"
            >
              {croppingTarget === cameraCfg.step3_vao_thanh_template ? '⏳ Đang cắt...' : '📸 Cắt lại ảnh'}
            </button>
            {onTestClick && cameraCfg.step3_vao_thanh_btn.x > 0 && (
              <button
                type="button"
                onClick={() => onTestClick('Vào Thành (Test)', cameraCfg.step3_vao_thanh_btn)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: '1px solid #475569',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ▶ Bấm thử
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
