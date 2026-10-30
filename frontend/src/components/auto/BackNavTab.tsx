import React, { useState, useEffect } from 'react';
import type { StudioAutoConfig, Point, StepPoint, BackNavConfig } from '../../types';
import { CoordInputRow } from './CoordInputRow';

interface BackNavTabProps {
  config: StudioAutoConfig;
  onChange: (updater: (prev: StudioAutoConfig) => StudioAutoConfig) => void;
  activePickingLabel?: string | null;
  onStartPick: (label: string, onPicked: (p: Point) => void, previousSteps?: StepPoint[]) => void;
  onCancelPick: () => void;
  navigatingLabel?: string | null;
  onTestClick?: (label: string, point: Point) => void;
  apiBase?: string;
}

export const BackNavTab: React.FC<BackNavTabProps> = ({
  config,
  onChange,
  activePickingLabel,
  onStartPick,
  onCancelPick,
  navigatingLabel,
  onTestClick,
  apiBase,
}) => {
  const baseUrl = apiBase || (window.location.port === '5173' ? 'http://127.0.0.1:8000' : window.location.origin);

  const backCfg: BackNavConfig = config.back_nav || {
    enabled: true,
    max_retries: 5,
    back_btn: { x: 80, y: 1240 },
    back_template: 'btn_back.png',
    back_templates: ['btn_back.png'],
    close_x_btn: { x: 660, y: 200 },
    close_x_template: 'btn_close_x.png',
    close_x_templates: ['btn_close_x.png'],
    popup_tap: { x: 360, y: 250 },
    swipe_from: { x: 360, y: 400 },
    swipe_to: { x: 360, y: 950 },
    snow_tap: { x: 360, y: 1150 },
    snow_template: 'snow_empty_area.png',
  };

  const backTemplates = backCfg.back_templates && backCfg.back_templates.length > 0 ? backCfg.back_templates : [backCfg.back_template];
  const closeXTemplates = backCfg.close_x_templates && backCfg.close_x_templates.length > 0 ? backCfg.close_x_templates : [backCfg.close_x_template];

  const [refreshKey, setRefreshKey] = useState<number>(Date.now());
  const [isRunningTest, setIsRunningTest] = useState<boolean>(false);
  const [croppingTarget, setCroppingTarget] = useState<string | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<{ name: string; size: number }[]>([]);

  const loadTemplatesList = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/auto/template/list`);
      if (res.ok) {
        const data = await res.json();
        setAvailableTemplates(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadTemplatesList();
  }, [baseUrl, refreshKey]);

  const updateBackCfg = (updater: (prev: BackNavConfig) => BackNavConfig) => {
    onChange((prev) => {
      const current = prev.back_nav || {
        enabled: true,
        max_retries: 5,
        back_btn: { x: 80, y: 1240 },
        back_template: 'btn_back.png',
        back_templates: ['btn_back.png'],
        close_x_btn: { x: 660, y: 200 },
        close_x_template: 'btn_close_x.png',
        close_x_templates: ['btn_close_x.png'],
        popup_tap: { x: 360, y: 250 },
        swipe_from: { x: 360, y: 400 },
        swipe_to: { x: 360, y: 950 },
        snow_tap: { x: 360, y: 1150 },
        snow_template: 'snow_empty_area.png',
      };
      return {
        ...prev,
        back_nav: updater(current),
      };
    });
  };

  // Cắt ảnh thủ công tại tọa độ
  const handleManualCrop = async (templateName: string, point: Point, targetType: 'back' | 'close_x' | 'snow') => {
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
        loadTemplatesList();
        if (targetType === 'back') {
          updateBackCfg((c) => {
            const list = c.back_templates || [];
            return {
              ...c,
              back_template: templateName,
              back_templates: list.includes(templateName) ? list : [...list, templateName],
            };
          });
        } else if (targetType === 'close_x') {
          updateBackCfg((c) => {
            const list = c.close_x_templates || [];
            return {
              ...c,
              close_x_template: templateName,
              close_x_templates: list.includes(templateName) ? list : [...list, templateName],
            };
          });
        }
      } else {
        alert('Lỗi cắt ảnh mẫu từ backend');
      }
    } catch (e) {
      alert('Không kết nối được backend để cắt ảnh: ' + String(e));
    } finally {
      setCroppingTarget(null);
    }
  };

  // Nạp ảnh tải lên từ máy tính cho Back hoặc Close X (FileReader Base64)
  const handleUploadTemplate = async (targetType: 'back' | 'close_x', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const res = await fetch(`${baseUrl}/api/auto/template/upload`, {
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
          setRefreshKey(Date.now());
          loadTemplatesList();
          if (targetType === 'back') {
            updateBackCfg((c) => {
              const list = c.back_templates || [];
              return {
                ...c,
                back_template: uploadedName,
                back_templates: list.includes(uploadedName) ? list : [...list, uploadedName],
              };
            });
          } else {
            updateBackCfg((c) => {
              const list = c.close_x_templates || [];
              return {
                ...c,
                close_x_template: uploadedName,
                close_x_templates: list.includes(uploadedName) ? list : [...list, uploadedName],
              };
            });
          }
        } else {
          alert('Lỗi tải ảnh lên server!');
        }
      } catch (err) {
        alert('Không thể tải ảnh: ' + String(err));
      }
    };
    reader.readAsDataURL(file);
  };

  // Chạy thử toàn bộ quy trình Trở Về & Đóng Popup
  const handleRunBackNav = async () => {
    setIsRunningTest(true);
    try {
      const resDev = await fetch(`${baseUrl}/api/devices`);
      const devData = await resDev.json();
      const serial = devData && devData.length > 0 ? devData[0].serial : '';
      if (!serial) {
        alert('Chưa kết nối thiết bị!');
        return;
      }
      await fetch(`${baseUrl}/api/auto/back-nav/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial }),
      });
    } catch (e) {
      console.error('Lỗi chạy Trở Về:', e);
    } finally {
      setIsRunningTest(false);
    }
  };

  // Thử vuốt kéo màn hình
  const handleTestSwipe = async () => {
    try {
      const resDev = await fetch(`${baseUrl}/api/devices`);
      const devData = await resDev.json();
      const serial = devData && devData.length > 0 ? devData[0].serial : '';
      if (!serial) return;
      await fetch(`${baseUrl}/api/devices/${serial}/swipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x1: backCfg.swipe_from.x,
          y1: backCfg.swipe_from.y,
          x2: backCfg.swipe_to.x,
          y2: backCfg.swipe_to.y,
          duration_ms: 450,
        }),
      });
    } catch (e) {
      console.error('Lỗi thử vuốt:', e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header Giới thiệu tính năng */}
      <div style={{ background: '#131c31', padding: 12, borderRadius: 8, border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h4 style={{ margin: 0, fontSize: 14, color: '#f8fafc', fontWeight: 700 }}>
            🔙 Tự Động Trở Về, Đóng Popup & Thoát Về Cuối Map
          </h4>
          <button
            type="button"
            disabled={isRunningTest}
            onClick={handleRunBackNav}
            style={{
              background: '#0284c7',
              border: 'none',
              color: 'white',
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: isRunningTest ? 'not-allowed' : 'pointer',
              boxShadow: '0 0 10px rgba(2, 132, 199, 0.4)',
            }}
          >
            {isRunningTest ? '⏳ ĐANG THỰC HIỆN...' : '▶ THỬ TRỞ VỀ / ĐÓNG HẾT POPUP'}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
          Module này hỗ trợ <strong>nạp nhiều ảnh mẫu nhận diện</strong> cho cả nút Trở Về và nút Đóng [X] (nhiều kiểu icon popup khác nhau): <br />
          <strong>1.</strong> Tự động quét danh sách các ảnh mẫu nút <strong>Trở Về</strong> (góc trái) hoặc các ảnh mẫu nút <strong>[X]</strong> (góc trên phải). Lặp lại nếu vẫn còn 2 nút đó. <br />
          <strong>2.</strong> Nhấn vào popup để đóng thông báo nổi. <br />
          <strong>3.</strong> Vuốt kéo camera xuống cuối map và nhấn vào <strong>vùng tuyết trống</strong> để bỏ chọn an toàn 100%.
        </p>
      </div>

      {/* 1. NÚT TRỞ VỀ (GÓC TRÁI - HỖ TRỢ NHIỀU ẢNH) */}
      <div style={{ background: '#0b1329', padding: 12, borderRadius: 8, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#38bdf8', color: '#0f172a', fontWeight: 800, padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>MỤC 1</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13 }}>Nút Trở Về (Hỗ trợ nhiều mẫu ảnh)</span>
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>Quét vùng góc dưới bên trái</span>
        </div>

        <CoordInputRow
          label="Nút Trở Về (Góc trái)"
          point={backCfg.back_btn}
          onUpdate={(pt) => {
            updateBackCfg((c) => ({ ...c, back_btn: pt }));
            setTimeout(() => setRefreshKey(Date.now()), 800);
          }}
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
          onTestClick={onTestClick}
        />

        {/* Danh sách các ảnh mẫu nút Trở Về */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#0f172a', padding: '10px 12px', borderRadius: 6, border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Ảnh mẫu đang quét:</span>
            {backTemplates.map((tpl) => (
              <div
                key={tpl}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#1e293b',
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: '1px solid #334155',
                }}
              >
                <img
                  src={`${baseUrl}/api/auto/template/image/${tpl}?t=${refreshKey}`}
                  alt=""
                  style={{ width: 24, height: 24, borderRadius: 3, objectFit: 'contain', background: '#020617' }}
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
                <span style={{ fontSize: 11, color: '#38bdf8' }}>{tpl}</span>
                {backTemplates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const updated = backTemplates.filter((t) => t !== tpl);
                      updateBackCfg((c) => ({ ...c, back_template: updated[0], back_templates: updated }));
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            {/* Nạp ảnh từ máy tính */}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                background: '#047857',
                color: '#a7f3d0',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📁 Nạp Ảnh
              <input
                type="file"
                accept="image/png, image/jpeg"
                style={{ display: 'none' }}
                onChange={(e) => handleUploadTemplate('back', e)}
              />
            </label>

            {/* Chọn từ thư viện */}
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (val && !backTemplates.includes(val)) {
                  updateBackCfg((c) => ({ ...c, back_templates: [...backTemplates, val] }));
                }
                e.target.value = '';
              }}
              defaultValue=""
              style={{ padding: '3px 6px', background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, fontSize: 11 }}
            >
              <option value="" disabled>+ Chọn từ thư viện...</option>
              {availableTemplates.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>

            <button
              type="button"
              disabled={croppingTarget === 'btn_back.png'}
              onClick={() => handleManualCrop(`btn_back_${Date.now().toString(36)}.png`, backCfg.back_btn, 'back')}
              style={{ padding: '3px 8px', background: '#451a03', border: '1px solid #d97706', color: '#fde68a', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              title="Cắt thêm ảnh mẫu nút Trở Về tại tọa độ hiện tại"
            >
              📸 Cắt Thêm Ảnh Mẫu
            </button>
          </div>
        </div>
      </div>

      {/* 2. NÚT ĐÓNG [X] (GÓC TRÊN PHẢI - HỖ TRỢ NHIỀU ẢNH) */}
      <div style={{ background: '#0b1329', padding: 12, borderRadius: 8, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#ef4444', color: '#ffffff', fontWeight: 800, padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>MỤC 2</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13 }}>Nút Đóng [X] (Hỗ trợ nhiều mẫu ảnh)</span>
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>Quét vùng góc trên bên phải</span>
        </div>

        <CoordInputRow
          label="Nút Đóng X (Góc trên phải)"
          point={backCfg.close_x_btn}
          onUpdate={(pt) => {
            updateBackCfg((c) => ({ ...c, close_x_btn: pt }));
            setTimeout(() => setRefreshKey(Date.now()), 800);
          }}
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
          onTestClick={onTestClick}
        />

        {/* Danh sách các ảnh mẫu nút Đóng X */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#0f172a', padding: '10px 12px', borderRadius: 6, border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Ảnh mẫu đang quét:</span>
            {closeXTemplates.map((tpl) => (
              <div
                key={tpl}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#1e293b',
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: '1px solid #334155',
                }}
              >
                <img
                  src={`${baseUrl}/api/auto/template/image/${tpl}?t=${refreshKey}`}
                  alt=""
                  style={{ width: 24, height: 24, borderRadius: 3, objectFit: 'contain', background: '#020617' }}
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
                <span style={{ fontSize: 11, color: '#f87171' }}>{tpl}</span>
                {closeXTemplates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const updated = closeXTemplates.filter((t) => t !== tpl);
                      updateBackCfg((c) => ({ ...c, close_x_template: updated[0], close_x_templates: updated }));
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            {/* Nạp ảnh từ máy tính */}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                background: '#047857',
                color: '#a7f3d0',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📁 Nạp Ảnh
              <input
                type="file"
                accept="image/png, image/jpeg"
                style={{ display: 'none' }}
                onChange={(e) => handleUploadTemplate('close_x', e)}
              />
            </label>

            {/* Chọn từ thư viện */}
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (val && !closeXTemplates.includes(val)) {
                  updateBackCfg((c) => ({ ...c, close_x_templates: [...closeXTemplates, val] }));
                }
                e.target.value = '';
              }}
              defaultValue=""
              style={{ padding: '3px 6px', background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', borderRadius: 4, fontSize: 11 }}
            >
              <option value="" disabled>+ Chọn từ thư viện...</option>
              {availableTemplates.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>

            <button
              type="button"
              disabled={croppingTarget === 'btn_close_x.png'}
              onClick={() => handleManualCrop(`btn_close_x_${Date.now().toString(36)}.png`, backCfg.close_x_btn, 'close_x')}
              style={{ padding: '3px 8px', background: '#451a03', border: '1px solid #d97706', color: '#fde68a', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              title="Cắt thêm ảnh mẫu nút X tại tọa độ hiện tại"
            >
              📸 Cắt Thêm Ảnh Mẫu
            </button>
          </div>
        </div>
      </div>

      {/* 3. CHẠM VÀO POPUP ĐỂ ĐÓNG */}
      <div style={{ background: '#0b1329', padding: 12, borderRadius: 8, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#8b5cf6', color: '#ffffff', fontWeight: 800, padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>MỤC 3</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13 }}>Chạm Vào Popup (Đóng thông báo nổi)</span>
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>Chạm 1 cái để tắt thông báo</span>
        </div>

        <CoordInputRow
          label="Điểm Chạm Popup"
          point={backCfg.popup_tap}
          onUpdate={(pt) => updateBackCfg((c) => ({ ...c, popup_tap: pt }))}
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
          onTestClick={onTestClick}
        />
      </div>

      {/* 4. KÉO XUỐNG CUỐI MAP & NHẤN VÙNG TUYẾT */}
      <div style={{ background: '#0b1329', padding: 12, borderRadius: 8, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#10b981', color: '#ffffff', fontWeight: 800, padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>MỤC 4</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13 }}>Kéo Màn Hình Xuống Cuối Map & Chạm Vùng Tuyết Trống</span>
          </div>
          <button
            type="button"
            onClick={handleTestSwipe}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: '1px solid #059669',
              background: '#064e3b',
              color: '#a7f3d0',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ▶ Thử Vuốt Kéo
          </button>
        </div>

        {/* Điểm bắt đầu và kết thúc vuốt */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <CoordInputRow
              label="Vuốt Bắt Đầu (Từ)"
              point={backCfg.swipe_from}
              onUpdate={(pt) => updateBackCfg((c) => ({ ...c, swipe_from: pt }))}
              activePickingLabel={activePickingLabel}
              onStartPick={onStartPick}
              onCancelPick={onCancelPick}
              navigatingLabel={navigatingLabel}
              onTestClick={onTestClick}
            />
          </div>
          <div style={{ flex: 1 }}>
            <CoordInputRow
              label="Vuốt Kết Thúc (Đến)"
              point={backCfg.swipe_to}
              onUpdate={(pt) => updateBackCfg((c) => ({ ...c, swipe_to: pt }))}
              activePickingLabel={activePickingLabel}
              onStartPick={onStartPick}
              onCancelPick={onCancelPick}
              navigatingLabel={navigatingLabel}
              onTestClick={onTestClick}
            />
          </div>
        </div>

        {/* Điểm chạm vào vùng tuyết */}
        <CoordInputRow
          label="Điểm Chạm Vào Vùng Tuyết (Bỏ chọn an toàn)"
          point={backCfg.snow_tap}
          onUpdate={(pt) => {
            updateBackCfg((c) => ({ ...c, snow_tap: pt }));
            setTimeout(() => setRefreshKey(Date.now()), 800);
          }}
          activePickingLabel={activePickingLabel}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          navigatingLabel={navigatingLabel}
          onTestClick={onTestClick}
        />
      </div>
    </div>
  );
};
