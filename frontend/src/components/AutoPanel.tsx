import React from 'react';
import type { StudioAutoConfig, Point, StepPoint, BoxRegion } from '../types';
import { ScenarioManager } from './scenario/ScenarioManager';

interface AutoPanelProps {
  config: StudioAutoConfig | null;
  onSave: (newCfg: StudioAutoConfig) => void;
  onStart: () => void;
  onStop: () => void;
  isRunning: boolean;
  activePickingLabel?: string | null;
  onStartPick: (label: string, onPicked: (p: Point, box?: BoxRegion) => void, previousSteps?: StepPoint[]) => void;
  onCancelPick: () => void;
  navigatingLabel?: string | null;
  onTestClick?: (label: string, point: Point) => void;
  onResetCamera?: () => void;
  onToggleEngine?: () => void;
  isEngineRunning?: boolean;
  apiBase?: string;
  selectedSerial?: string;
}

export const AutoPanel: React.FC<AutoPanelProps> = ({
  activePickingLabel,
  onStartPick,
  onCancelPick,
  onTestClick,
  apiBase,
  selectedSerial,
  onToggleEngine,
  isEngineRunning,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <ScenarioManager
        apiBase={apiBase || (window.location.port === '5173' ? 'http://127.0.0.1:8000' : window.location.origin)}
        selectedSerial={selectedSerial || ''}
        activePickingLabel={activePickingLabel}
        onStartPick={onStartPick}
        onCancelPick={onCancelPick}
        onTestClick={onTestClick}
        onToggleEngine={onToggleEngine}
        engineRunning={isEngineRunning}
      />
    </div>
  );
};
