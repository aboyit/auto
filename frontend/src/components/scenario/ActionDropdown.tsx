import React, { useState, useEffect, useRef } from 'react';
import type { ActionType } from '../../types/scenario';

export interface ActionItem {
  type: ActionType;
  icon: string;
  name: string;
  desc: string;
  badge?: string;
  color: string;
  border: string;
  bg: string;
}

export interface ActionGroup {
  category: string;
  items: ActionItem[];
}

export const ACTION_GROUPS: ActionGroup[] = [
  {
    category: 'NHẬN DIỆN & TƯƠNG TÁC HÌNH ẢNH',
    items: [
      {
        type: 'if_template',
        icon: '❓',
        name: 'Kiểm Tra Ảnh (If/Else)',
        desc: 'Quét màn hình, rẽ 2 nhánh CÓ hoặc KHÔNG tìm thấy ảnh mẫu',
        badge: 'Rẽ Nhánh',
        color: '#fef08a',
        border: '#eab308',
        bg: '#78350f',
      },
      {
        type: 'click_matched',
        icon: '👆',
        name: 'Bấm Ảnh Đã Tìm',
        desc: 'Tự động bấm vào vị trí ảnh đã phát hiện từ bước kiểm tra trước',
        badge: 'Click',
        color: '#a5f3fc',
        border: '#06b6d4',
        bg: '#164e63',
      },
      {
        type: 'template_tap',
        icon: '📸',
        name: 'Tìm & Bấm Luôn',
        desc: 'Vừa quét tìm mẫu ảnh vừa bấm ngay lập tức khi phát hiện',
        badge: 'Nhanh',
        color: '#fed7aa',
        border: '#f97316',
        bg: '#451a03',
      },
      {
        type: 'tap',
        icon: '🎯',
        name: 'Bấm Tọa Độ Cố Định',
        desc: 'Chạm chính xác vào tọa độ (X, Y) cố định trên màn hình',
        color: '#bae6fd',
        border: '#0284c7',
        bg: '#0c4a6e',
      },
    ],
  },
  {
    category: 'ĐIỀU KHIỂN & CẢM ỨNG THIẾT BỊ',
    items: [
      {
        type: 'key_back',
        icon: '🔙',
        name: 'Phím Trở Về (Back)',
        desc: 'Bấm nút Back / ESC để đóng popup, thoát cửa sổ',
        badge: 'Thoát',
        color: '#ffe4e6',
        border: '#fb7185',
        bg: '#be123c',
      },
      {
        type: 'swipe',
        icon: '↔️',
        name: 'Vuốt Màn Hình',
        desc: 'Kéo vuốt giữa 2 điểm (cuộn bản đồ, lướt trang)',
        color: '#f5d0fe',
        border: '#d946ef',
        bg: '#701a75',
      },
      {
        type: 'delay',
        icon: '⏳',
        name: 'Chờ Đợi (Sleep)',
        desc: 'Dừng nghỉ số giây nhất định trước khi sang bước sau',
        color: '#e5e7eb',
        border: '#4b5563',
        bg: '#1f2937',
      },
    ],
  },
  {
    category: 'QUẢN LÝ LUỒNG QUY TRÌNH',
    items: [
      {
        type: 'run_scenario',
        icon: '📦',
        name: 'Gọi Kịch Bản Con',
        desc: 'Lồng kịch bản con khác vào quy trình hiện tại',
        color: '#e0e7ff',
        border: '#4338ca',
        bg: '#1e1b4b',
      },
      {
        type: 'finish',
        icon: '🏁',
        name: 'Kết Thúc Kịch Bản',
        desc: 'Ngắt kịch bản ngay lập tức, trả kết quả thành công/thất bại',
        badge: 'Dừng',
        color: '#6ee7b7',
        border: '#10b981',
        bg: '#064e3b',
      },
    ],
  },
];

interface ActionDropdownProps {
  onSelectAction: (type: ActionType) => void;
  disabled?: boolean;
}

export const ActionDropdown: React.FC<ActionDropdownProps> = ({ onSelectAction, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleChoose = (type: ActionType) => {
    onSelectAction(type);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Nút dropdown kích hoạt */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 700,
          color: '#ffffff',
          background: isOpen
            ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
            : 'linear-gradient(135deg, #0369a1 0%, #075985 100%)',
          border: '1px solid #38bdf8',
          borderRadius: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: isOpen
            ? '0 0 12px rgba(56, 189, 248, 0.45)'
            : '0 2px 4px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.15s ease',
        }}
        title="Bấm để mở danh sách hành động thêm vào quy trình"
      >
        <span style={{ fontSize: 13 }}>➕</span>
        <span>THÊM HÀNH ĐỘNG</span>
        <span
          style={{
            fontSize: 10,
            transition: 'transform 0.2s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            opacity: 0.85,
          }}
        >
          ▼
        </span>
      </button>

      {/* Listdown Dropdown Menu Popover */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: 360,
            maxHeight: 460,
            overflowY: 'auto',
            background: 'rgba(15, 23, 42, 0.98)',
            backdropFilter: 'blur(14px)',
            border: '1px solid #334155',
            borderRadius: 8,
            boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.85), 0 0 1px 1px rgba(255, 255, 255, 0.08)',
            zIndex: 9999,
            padding: '6px 0',
          }}
        >
          <div
            style={{
              padding: '6px 12px 8px 12px',
              borderBottom: '1px solid #1e293b',
              fontSize: 10,
              fontWeight: 800,
              color: '#38bdf8',
              letterSpacing: 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>DANH SÁCH HÀNH ĐỘNG</span>
            <span style={{ color: '#64748b', fontWeight: 500 }}>Bấm để thêm vào quy trình</span>
          </div>

          {ACTION_GROUPS.map((group, gIdx) => (
            <div key={group.category} style={{ marginTop: gIdx > 0 ? 6 : 4 }}>
              {/* Category Header */}
              <div
                style={{
                  padding: '4px 12px 2px 12px',
                  fontSize: 9,
                  fontWeight: 800,
                  color: '#64748b',
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                }}
              >
                {group.category}
              </div>

              {/* Action Items in Group */}
              {group.items.map((item) => (
                <div
                  key={item.type}
                  onClick={() => handleChoose(item.type)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    transition: 'background 0.12s ease',
                    borderBottom: '1px solid rgba(30, 41, 59, 0.4)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#1e293b';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {/* Icon Box */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: item.bg,
                      border: `1px solid ${item.border}`,
                      color: item.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {item.icon}
                  </div>

                  {/* Text details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>
                        {item.name}
                      </span>
                      {item.badge && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: item.border,
                            color: '#0f172a',
                            lineHeight: 1.2,
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, lineHeight: 1.3 }}>
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

