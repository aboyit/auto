export interface DeviceInfo {
  serial: string;
  state: string;
  model: string;
  connected: boolean;
  width: number;
  height: number;
}

export interface FrameMetadata {
  frame_id: string;
  captured_at: number;
  width: number;
  height: number;
  serial: string;
}

export interface LogEntry {
  id: string;
  time: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  tag: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface BoxRegion {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface StepPoint {
  x: number;
  y: number;
  name: string;
}

export interface AllianceHelpConfig {
  enabled: boolean;
  interval_seconds: number;
  handshake_btn: Point;
  help_all_btn?: Point;
}

export interface AllianceOpenConfig {
  enabled: boolean;
  open_btn: Point;
}

export interface AllianceGiftConfig {
  enabled: boolean;
  interval_minutes: number;
  step1_alliance_btn: Point;
  step2_gift_btn: Point;
  step3_claim_btn: Point;
  step4_back_btn1: Point;
  step5_back_btn2: Point;
}

export interface CitizenGiftConfig {
  enabled: boolean;
  interval_seconds: number;
  gift_icon: Point;
  claim_btn: Point;
}

export interface TroopTrainConfig {
  enabled: boolean;
  step0_collect_btn?: Point;
  step1_building_btn: Point;
  step2_menu_btn: Point;
  step3_train_btn: Point;
}

export interface BarracksConfig {
  enabled: boolean;
  interval_minutes: number;
  cavalry?: TroopTrainConfig;
  infantry?: TroopTrainConfig;
  archers?: TroopTrainConfig;
  train_infantry: boolean;
  train_cavalry: boolean;
  train_archers: boolean;
  infantry_building: Point;
  cavalry_building: Point;
  archer_building: Point;
  train_confirm_btn: Point;
}

export interface GatherResourceConfig {
  enabled: boolean;
  interval_minutes: number;
  squad_count: number;
  target_type: string;
  world_map_btn: Point;
  search_res_btn: Point;
  dispatch_btn: Point;
}

export interface CameraResetConfig {
  step1_outside_tap: Point;
  step2_xuat_thanh_btn: Point;
  step2_xuat_thanh_template: string;
  step3_vao_thanh_btn: Point;
  step3_vao_thanh_template: string;
}

export interface BackNavConfig {
  enabled: boolean;
  max_retries: number;
  back_btn: Point;
  back_template: string;
  back_templates?: string[];
  close_x_btn: Point;
  close_x_template: string;
  close_x_templates?: string[];
  popup_tap: Point;
  swipe_from: Point;
  swipe_to: Point;
  snow_tap: Point;
  snow_template: string;
}

export interface StudioAutoConfig {
  is_running: boolean;
  camera_reset?: CameraResetConfig;
  back_nav?: BackNavConfig;
  alliance_help: AllianceHelpConfig;
  alliance_open: AllianceOpenConfig;
  alliance_gift: AllianceGiftConfig;
  citizen_gift: CitizenGiftConfig;
  barracks: BarracksConfig;
  gather: GatherResourceConfig;
}
