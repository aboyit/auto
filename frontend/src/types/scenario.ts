import type { Point } from '../types';

export type ActionType =
  | 'tap'
  | 'template_tap'
  | 'if_template'
  | 'click_matched'
  | 'key_back'
  | 'swipe'
  | 'delay'
  | 'run_scenario'
  | 'finish'
  | 'loop';

export type BranchType = 'default' | 'true' | 'false';

export interface ScenarioStep {
  id: string;
  type: ActionType;
  name: string;
  enabled: boolean;

  // Lặp lại áp dụng cho mọi hành động (Cách 1):
  repeat_count?: number; // Số lần lặp lại hành động này (mặc định 1)
  repeat_delay?: number; // Khoảng nghỉ giữa các lần lặp (giây)

  // Tọa độ vị trí kéo thả tự do trên canvas (x, y):
  node_x?: number;
  node_y?: number;

  // Params tap:
  point?: Point;
  delay_after?: number;

  // Params template_tap & if_template & loop:
  template_name?: string;
  templates?: string[];
  threshold?: number;
  region?: [number, number, number, number] | null;
  fallback_point?: Point;

  // Params click_matched (bấm vào ảnh vừa tìm thấy từ bước if_template):
  target_match_step_id?: string;

  // Params swipe:
  swipe_from?: Point;
  swipe_to?: Point;
  duration_ms?: number;

  // Params delay:
  delay_seconds?: number;

  // Params run_scenario:
  target_scenario_id?: string;

  // Params finish (dừng kịch bản sớm & trả về kết quả):
  finish_status?: 'success' | 'fail';

  // Params loop:
  loop_mode?: 'while_template_found' | 'count';
  loop_count?: number; // Số lần lặp lại (ví dụ lặp lại 5 lần)
  max_iterations?: number;
  delay_between?: number;
  loop_target_step_id?: string; // Bước đích mà vòng lặp liên kết tới
}

export interface ScenarioConnection {
  from_id: string;
  to_id: string;
  branch?: BranchType;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  interval_minutes: number;
  last_run_time?: number;

  // Lặp lại toàn bộ quy trình các bước (A -> B -> A -> B):
  loop_count?: number; // Số vòng lặp lại toàn bộ quy trình kịch bản
  loop_delay?: number; // Thời gian nghỉ giữa các vòng lặp (giây)

  steps: ScenarioStep[];
  connections?: ScenarioConnection[];
}

