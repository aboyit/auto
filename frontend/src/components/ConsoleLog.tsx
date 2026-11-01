import React, { useRef, useEffect, useState } from 'react';
import type { LogEntry } from '../types';

interface ConsoleLogProps {
  logs: LogEntry[];
  onClear: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ConsoleLog: React.FC<ConsoleLogProps> = ({
  logs,
  onClear,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs.map((log) => `[${log.time}] [${log.level}] <${log.tag}> ${log.message}`).join('\n'));
      setCopyStatus('Đã copy');
    } catch {
      setCopyStatus('Copy thất bại');
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR':
        return '#f87171';
      case 'WARN':
        return '#fbbf24';
      case 'SUCCESS':
        return '#4ade80';
      case 'DEBUG':
        return '#94a3b8';
      default:
        return '#38bdf8';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0f1d', borderRadius: 8, border: '1px solid #1e293b', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#0f172a', borderBottom: isCollapsed ? 'none' : '1px solid #1e293b', minHeight: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>📋 Console Logs</span>
          <span style={{ fontSize: 11, background: '#1e293b', color: '#94a3b8', padding: '1px 6px', borderRadius: 10 }}>{logs.length}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isCollapsed && (
            <button type="button" onClick={copyLogs} disabled={!logs.length} title="Sao chép toàn bộ log" style={{ padding: '3px 8px', fontSize: 11, background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: 4, cursor: logs.length ? 'pointer' : 'not-allowed' }}>
              {copyStatus || 'Copy log'}
            </button>
          )}
          {!isCollapsed && (
            <button
              onClick={onClear}
              style={{
                padding: '3px 8px',
                fontSize: 11,
                background: '#334155',
                color: '#cbd5e1',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 500,
              }}
              title="Xóa toàn bộ log"
            >
              Xóa log
            </button>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                background: isCollapsed ? '#0284c7' : '#1e293b',
                color: isCollapsed ? '#ffffff' : '#94a3b8',
                border: '1px solid #334155',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              title={isCollapsed ? 'Mở rộng Console Log' : 'Thu gọn/Ẩn Console Log'}
            >
              {isCollapsed ? '▲ Hiện Console' : '▼ Ẩn Console'}
            </button>
          )}
        </div>
      </div>

      {/* Log entries scrollable (Chỉ render khi không bị thu gọn) */}
      {!isCollapsed && (
        <div style={{ flex: 1, padding: '10px 14px', overflowY: 'auto', fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace', fontSize: 13, lineHeight: 1.6, background: '#020617' }}>
          {logs.map((log) => (
            <div key={log.id} style={{ display: 'flex', gap: 10, marginBottom: 5 }}>
              <span style={{ color: '#64748b', flexShrink: 0 }}>[{log.time}]</span>
              <span style={{ color: getLevelColor(log.level), fontWeight: 700, flexShrink: 0, minWidth: 48 }}>[{log.level}]</span>
              <span style={{ color: '#c084fc', flexShrink: 0, fontWeight: 600 }}>&lt;{log.tag}&gt;</span>
              <span style={{ color: '#f1f5f9', wordBreak: 'break-word' }}>{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && (
            <div style={{ color: '#475569', fontStyle: 'italic', textAlign: 'center', marginTop: 30 }}>
              Chưa có nhật ký hoạt động nào được ghi nhận...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
};
