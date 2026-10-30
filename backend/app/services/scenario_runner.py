"""Bo thuc thi kich ban Macro (Scenario Engine)."""

import asyncio
import time
from app.core.logger import log_manager
from app.core.scenario_models import Scenario, ScenarioStep, load_scenarios, save_scenarios
from app.services.dispatcher import input_dispatcher
from app.services.auto_common import safe_tap, find_button_by_template, execute_camera_reset, execute_back_navigation

class ScenarioTracker:
    def __init__(self):
        self.stack             = []
        self.current_run_steps = []
        self.run_start_time    = 0.0
        self.last_report       = None
        self.state = {
            "is_running":          False,
            "scenario_id":         "",
            "scenario_name":       "",
            "current_cycle":       1,
            "total_cycles":        1,
            "current_step_id":     "",
            "current_step_name":   "",
            "current_rep":         1,
            "total_reps":          1,
            "status":              "idle",
            "message":             "",
            "active_step_ids":     [],
            "active_scenario_ids": [],
            "call_stack":          [],
            "active_connection":   None,
            "last_report":         None
        }
        self.abort_requested = False

    def start_report(self, scenario_id: str, scenario_name: str):
        """Bắt đầu thu thập dữ liệu báo cáo cho lần chạy này."""
        self.current_run_steps = []
        self.run_start_time    = time.time()
        self.state["last_report"] = None

    def record_step_execution(self, step_data: dict):
        """Lưu lại kết quả và thời gian xử lý của từng bước chạy."""
        self.current_run_steps.append(step_data)
        self._notify()

    def finalize_report(self, scenario_id: str, scenario_name: str, final_success: bool, stop_reason: str = "Hoàn tất kịch bản") -> dict:
        """Tổng hợp và tạo báo cáo chi tiết sau khi kịch bản kết thúc."""
        end_time  = time.time()
        if self.run_start_time > 0:
            total_sec = round(end_time - self.run_start_time, 2)
        else:
            total_sec = 0.0

        success_count = 0
        failed_count  = 0
        for st in self.current_run_steps:
            if st.get("success"):
                success_count = success_count + 1
            else:
                failed_count  = failed_count + 1

        if self.abort_requested:
            final_status = "stopped"
        else:
            if final_success:
                final_status = "success"
            else:
                final_status = "failed"

        report = {
            "scenario_id":        scenario_id,
            "scenario_name":      scenario_name,
            "start_time":         time.strftime("%H:%M:%S", time.localtime(self.run_start_time)),
            "end_time":           time.strftime("%H:%M:%S", time.localtime(end_time)),
            "total_duration_sec": total_sec,
            "total_steps":        len(self.current_run_steps),
            "success_count":      success_count,
            "failed_count":       failed_count,
            "final_status":       final_status,
            "stop_reason":        stop_reason,
            "steps":              list(self.current_run_steps)
        }
        self.last_report = report
        self.state["last_report"] = report
        self._notify()
        return report

    def get_last_report(self):
        return self.last_report

    def push_scenario(self, scenario_id: str, scenario_name: str, total_cycles: int = 1):
        self.abort_requested = False
        frame = {
            "scenario_id": scenario_id,
            "scenario_name": scenario_name,
            "total_cycles": max(1, total_cycles),
            "current_cycle": 1,
            "current_step_id": "",
            "current_step_name": "",
            "current_rep": 1,
            "total_reps": 1,
            "status": "running"
        }
        self.stack.append(frame)
        self._sync_state()

    def pop_scenario(self, scenario_id: str = ""):
        if self.stack:
            if scenario_id:
                for i in range(len(self.stack) - 1, -1, -1):
                    if self.stack[i]["scenario_id"] == scenario_id:
                        self.stack.pop(i)
                        break
            else:
                self.stack.pop()
        self._sync_state()

    def set_running(self, scenario_id: str, scenario_name: str, total_cycles: int = 1):
        self.push_scenario(scenario_id, scenario_name, total_cycles)

    def request_stop(self):
        """Yêu cầu dừng khẩn cấp kịch bản đang chạy."""
        self.abort_requested = True
        self.stack.clear()
        self.state["is_running"]          = False
        self.state["status"]              = "idle"
        self.state["active_step_ids"]     = []
        self.state["active_scenario_ids"] = []
        self.state["call_stack"]          = []
        self.state["active_connection"]   = None
        self._notify()

    def set_active_connection(self, from_id: str, to_id: str, branch: str = "default"):
        """Ghi nhận đường nối đang được kịch bản kích hoạt di chuyển."""
        self.state["active_connection"] = {
            "from_id": from_id,
            "to_id":   to_id,
            "branch":  branch
        }
        self._notify()

    def should_stop(self) -> bool:
        return self.abort_requested

    def set_step(self, step_id: str, step_name: str, cycle: int, rep: int, total_reps: int, status: str = "running", scenario_id: str = ""):
        target_frame = None
        if scenario_id:
            for frame in reversed(self.stack):
                if frame["scenario_id"] == scenario_id:
                    target_frame = frame
                    break
        if target_frame is None:
            if self.stack:
                target_frame = self.stack[-1]

        if target_frame is not None:
            target_frame["current_step_id"]   = step_id
            target_frame["current_step_name"] = step_name
            target_frame["current_cycle"]     = cycle
            target_frame["current_rep"]       = rep
            target_frame["total_reps"]        = total_reps
            target_frame["status"]            = status
        self._sync_state()

    def set_idle(self, scenario_id: str = ""):
        if scenario_id:
            self.pop_scenario(scenario_id)
        else:
            self.stack.clear()
            self._sync_state()

    def _sync_state(self):
        if not self.stack:
            self.state["is_running"]          = False
            self.state["status"]              = "idle"
            self.state["current_step_id"]     = ""
            self.state["current_step_name"]   = ""
            self.state["active_step_ids"]     = []
            self.state["active_scenario_ids"] = []
            self.state["call_stack"]          = []
            self.state["active_connection"]   = None
        else:
            self.state["is_running"]          = True
            self.state["status"]              = "running"
            top_frame                         = self.stack[-1]
            self.state["scenario_id"]         = top_frame["scenario_id"]
            self.state["scenario_name"]       = top_frame["scenario_name"]
            self.state["current_cycle"]       = top_frame["current_cycle"]
            self.state["total_cycles"]        = top_frame["total_cycles"]
            self.state["current_step_id"]     = top_frame["current_step_id"]
            self.state["current_step_name"]   = top_frame["current_step_name"]
            self.state["current_rep"]         = top_frame["current_rep"]
            self.state["total_reps"]          = top_frame["total_reps"]
            self.state["active_step_ids"]     = [f["current_step_id"] for f in self.stack if f.get("current_step_id")]
            self.state["active_scenario_ids"] = [f["scenario_id"] for f in self.stack if f.get("scenario_id")]
            self.state["call_stack"]          = list(self.stack)
        self._notify()

    def _notify(self):
        sc_id = self.state.get("scenario_id", "")
        st_id = self.state.get("current_step_id", "")
        cyc = self.state.get("current_cycle", 1)
        tot_c = self.state.get("total_cycles", 1)
        rep = self.state.get("current_rep", 1)
        tot_r = self.state.get("total_reps", 1)
        st = self.state.get("status", "idle")
        log_manager.log("DEBUG", f"PROGRESS|{sc_id}|{st_id}|{cyc}|{tot_c}|{rep}|{tot_r}|{st}", "PROGRESS")

scenario_tracker = ScenarioTracker()

async def execute_scenario_step(
    serial: str,
    step: ScenarioStep,
    all_scenarios_map: dict[str, Scenario],
    depth: int = 0,
    cycle: int = 1,
    scenario_id: str = "",
    context: dict | None = None
) -> bool:
    """Thực thi một bước hành động đơn lẻ trong kịch bản (hỗ trợ lặp lại repeat_count lần)."""
    tag = "SCENARIO"
    if not step.enabled:
        log_manager.log("DEBUG", f"⏭️ Bỏ qua bước '{step.name}' (đã tắt)", tag)
        return True

    step_type    = step.type
    repeat_times = max(1, getattr(step, 'repeat_count', 1) or getattr(step, 'loop_count', 1) or 1)
    repeat_delay = max(0.1, getattr(step, 'repeat_delay', 0.5) or getattr(step, 'delay_between', 0.5) or 0.5)

    if repeat_times > 1:
        log_manager.log("INFO", f"▶ [BẮT ĐẦU BƯỚC] '{step.name}' ({step_type}) - Lặp {repeat_times} lần (nghỉ {repeat_delay}s/lần)", tag)
    else:
        log_manager.log("INFO", f"▶ [BẮT ĐẦU BƯỚC] '{step.name}' ({step_type})", tag)

    overall_success = True

    for rep in range(1, repeat_times + 1):
        scenario_tracker.set_step(step.id, step.name, cycle, rep, repeat_times, "running", scenario_id=scenario_id)
        if repeat_times > 1:
            log_manager.log("INFO", f"  ↪ [Lần {rep}/{repeat_times}] Đang thực hiện '{step.name}'...", tag)

        step_success = False

        # 1. Bấm phím Trở Về Android (Back / ESC)
        if step_type == "key_back":
            ok = await input_dispatcher.keyevent(serial, 4)
            if ok:
                log_manager.log("INFO", f"✔ [PHÍM TRỞ VỀ] Bấm phím Back thành công (Lần {rep}/{repeat_times})", tag)
                step_success = True
                if context is not None:
                    context["last_step_detail"] = "Gửi phím Trở Về (Back) thành công"
            else:
                log_manager.log("ERROR", f"❌ [PHÍM TRỞ VỀ] Gửi phím Back thất bại", tag)
                if context is not None:
                    context["last_step_detail"] = "Gửi phím Trở Về (Back) thất bại"

        # 2. Nhấn tọa độ (Tap)
        elif step_type == "tap":
            p = step.point
            if p.x <= 0 or p.y <= 0:
                log_manager.log("WARN", f"❌ [LỖI] Bước '{step.name}' chưa gán tọa độ hợp lệ ({p.x}, {p.y})", tag)
                if context is not None:
                    context["last_step_detail"] = f"Tọa độ không hợp lệ ({p.x}, {p.y})"
                return False
            step_success = await safe_tap(serial, p.x, p.y, delay_after=step.delay_after, label=step.name)
            if step_success:
                log_manager.log("INFO", f"✔ [NHẤN TỌA ĐỘ] Nhấn ({p.x}, {p.y}) thành công", tag)
                if context is not None:
                    context["last_step_detail"] = f"Nhấn tọa độ ({p.x}, {p.y}) thành công"
            else:
                log_manager.log("ERROR", f"❌ [NHẤN TỌA ĐỘ] Nhấn ({p.x}, {p.y}) thất bại", tag)
                if context is not None:
                    context["last_step_detail"] = f"Nhấn tọa độ ({p.x}, {p.y}) thất bại"

        # 3. Tìm ảnh và nhấn vào tâm (Template Tap - Thuần nhận diện ảnh)
        elif step_type == "template_tap":
            templates_to_check = list(dict.fromkeys([t for t in (getattr(step, 'templates', []) or []) + [step.template_name] if t]))
            if not templates_to_check:
                log_manager.log("WARN", f"❌ [LỖI] Bước '{step.name}' chưa có ảnh mẫu nào để nhận diện!", tag)
                if context is not None:
                    context["last_step_detail"] = "Chưa có ảnh mẫu để nhận diện"
                return False
            else:
                if step.region and len(step.region) == 4:
                    region_tuple = tuple(step.region)
                else:
                    region_tuple = (0.0, 0.0, 1.0, 1.0)
                best_conf    = 0.0
                best_tpl     = ""
                found_match  = False
                for tpl in templates_to_check:
                    found, cx, cy, conf = find_button_by_template(serial, tpl, threshold=step.threshold, region=region_tuple)
                    if conf > best_conf:
                        best_conf = conf
                        best_tpl  = tpl
                    if found:
                        log_manager.log("INFO", f"✔ [TÌM THẤY] Thấy '{tpl}' ({conf:.2f} >= {step.threshold}) tại ({cx}, {cy})", tag)
                        if context is not None:
                            context["last_match_point"] = (cx, cy)
                            if "matched_steps" not in context:
                                context["matched_steps"] = {}
                            context["matched_steps"][step.id] = (cx, cy)
                            context["last_step_detail"]        = f"Thấy ảnh '{tpl}' ({conf:.2f} >= {step.threshold}) và nhấn ({cx}, {cy})"
                        step_success = await safe_tap(serial, cx, cy, delay_after=step.delay_after, label=f"{step.name} ({tpl})")
                        found_match  = True
                        break

                if not found_match:
                    log_manager.log("WARN", f"❌ Không tìm thấy ảnh nào trong {templates_to_check} (khớp cao nhất: {best_conf:.2f} < {step.threshold})", tag)
                    if context is not None:
                        context["last_step_detail"] = f"Không thấy ảnh (khớp cao nhất: {best_conf:.2f} < {step.threshold})"

        # 3b. Kiểm tra có ảnh hay không (If/Else Condition - Chỉ kiểm tra, không bấm)
        elif step_type == "if_template":
            templates_to_check = list(dict.fromkeys([t for t in (getattr(step, 'templates', []) or []) + [step.template_name] if t]))
            if not templates_to_check:
                log_manager.log("WARN", f"❌ [LỖI] Bước kiểm tra '{step.name}' chưa có ảnh mẫu nào!", tag)
                step_success = False
                if context is not None:
                    context["last_step_detail"] = "Chưa có ảnh mẫu để kiểm tra If/Else"
            else:
                if step.region and len(step.region) == 4:
                    region_tuple = tuple(step.region)
                else:
                    region_tuple = (0.0, 0.0, 1.0, 1.0)
                best_conf    = 0.0
                best_tpl     = ""
                found_match  = False
                for tpl in templates_to_check:
                    found, cx, cy, conf = find_button_by_template(serial, tpl, threshold=step.threshold, region=region_tuple)
                    if conf > best_conf:
                        best_conf = conf
                        best_tpl  = tpl
                    if found:
                        log_manager.log("INFO", f"🟢 [ĐIỀU KIỆN ĐÚNG] Thấy ảnh '{tpl}' ({conf:.2f} >= {step.threshold}) tại ({cx}, {cy})", tag)
                        if context is not None:
                            context["last_match_point"] = (cx, cy)
                            if "matched_steps" not in context:
                                context["matched_steps"] = {}
                            context["matched_steps"][step.id] = (cx, cy)
                            context["last_step_detail"]        = f"Thấy ảnh '{tpl}' ({conf:.2f} >= {step.threshold}) tại ({cx}, {cy})"
                        step_success = True
                        found_match  = True
                        break

                if not found_match:
                    log_manager.log("INFO", f"🔴 [ĐIỀU KIỆN SAI] Không thấy ảnh {templates_to_check} (khớp cao nhất: {best_conf:.2f} < {step.threshold})", tag)
                    step_success = False
                    if context is not None:
                        context["last_step_detail"] = f"Không thấy ảnh (khớp cao nhất: {best_conf:.2f} < {step.threshold})"

        # 3c. Bấm vào ảnh đã tìm thấy từ bước If/Else
        elif step_type == "click_matched":
            target_pt = None
            if context is not None:
                if step.target_match_step_id and "matched_steps" in context:
                    target_pt = context["matched_steps"].get(step.target_match_step_id)
                if not target_pt:
                    target_pt = context.get("last_match_point")

            if target_pt:
                cx, cy = target_pt
                log_manager.log("INFO", f"✔ [BẤM ẢNH ĐÃ TÌM] Nhấn vào tọa độ ({cx}, {cy})", tag)
                if context is not None:
                    context["last_step_detail"] = f"Nhấn vào ảnh đã tìm tại ({cx}, {cy})"
                step_success = await safe_tap(serial, cx, cy, delay_after=step.delay_after, label=step.name)
            else:
                log_manager.log("WARN", f"❌ [BẤM ẢNH ĐÃ TÌM] Không có tọa độ ảnh để bấm (chưa quét ảnh hoặc không thấy)", tag)
                if context is not None:
                    context["last_step_detail"] = "Không có tọa độ ảnh hợp lệ để nhấn"
                step_success = False

        # 4. Vuốt màn hình (Swipe)
        elif step_type == "swipe":
            sf  = step.swipe_from
            st  = step.swipe_to
            dur = getattr(step, 'duration_ms', 400)
            step_success = await input_dispatcher.swipe(serial, sf.x, sf.y, st.x, st.y, duration_ms=dur)
            if step_success:
                log_manager.log("INFO", f"✔ [VUỐT] Vuốt màn hình '{step.name}' thành công", tag)
                if context is not None:
                    context["last_step_detail"] = f"Vuốt từ ({sf.x}, {sf.y}) đến ({st.x}, {st.y}) ({dur}ms)"
            else:
                log_manager.log("ERROR", f"❌ [VUỐT] Vuốt màn hình '{step.name}' thất bại", tag)
                if context is not None:
                    context["last_step_detail"] = f"Vuốt từ ({sf.x}, {sf.y}) đến ({st.x}, {st.y}) thất bại"

        # 5. Chờ đợi (Delay)
        elif step_type == "delay":
            secs = max(0.1, step.delay_seconds)
            log_manager.log("INFO", f"⏳ [NGHỈ] Chờ {secs}s...", tag)
            await asyncio.sleep(secs)
            step_success = True
            if context is not None:
                context["last_step_detail"] = f"Chờ đợi {secs} giây"

        # 6. Gọi kịch bản con (Sub-scenario)
        elif step_type == "run_scenario":
            target_id = step.target_scenario_id
            if not target_id or target_id not in all_scenarios_map:
                log_manager.log("WARN", f"❌ [LỖI] Không tìm thấy kịch bản con ID '{target_id}'", tag)
                if context is not None:
                    context["last_step_detail"] = f"Không tìm thấy kịch bản con ID '{target_id}'"
                return False
            sub_sc = all_scenarios_map[target_id]
            log_manager.log("INFO", f"▶ [GỌI KỊCH BẢN CON] Bắt đầu '{sub_sc.name}'...", tag)
            scenario_tracker.set_step(step.id, step.name, cycle, rep, repeat_times, "running", scenario_id=scenario_id)
            step_success = await execute_scenario(serial, sub_sc.id, depth=depth + 1)
            # Sau khi kịch bản con chạy xong, khôi phục lại trạng thái bước gọi của cha
            scenario_tracker.set_step(step.id, step.name, cycle, rep, repeat_times, "running", scenario_id=scenario_id)
            if context is not None:
                if step_success:
                    context["last_step_detail"] = f"Chạy kịch bản con '{sub_sc.name}' thành công"
                else:
                    context["last_step_detail"] = f"Kịch bản con '{sub_sc.name}' thất bại"

        # 6b. Kết thúc kịch bản (Finish / Break Loop)
        elif step_type == "finish":
            f_status = getattr(step, 'finish_status', 'success')
            if not f_status:
                f_status = 'success'
            if f_status == "success":
                is_ok = True
                status_text = "THÀNH CÔNG"
            else:
                is_ok = False
                status_text = "THẤT BẠI"
            log_manager.log("INFO", f"🏁 [KẾT THÚC KỊCH BẢN] Bước '{step.name}' dừng kịch bản với trạng thái: {status_text}!", tag)
            if context is not None:
                context["finished"]         = True
                context["finish_status"]    = f_status
                context["last_step_detail"] = f"Dừng kịch bản: {status_text}"
            step_success = is_ok

        # 7. Tương thích ngược cũ (Loop)
        elif step_type == "loop":
            templates_to_check = list(dict.fromkeys([t for t in (getattr(step, 'templates', []) or []) + [step.template_name] if t]))
            for tpl in templates_to_check:
                found, cx, cy, conf = find_button_by_template(serial, tpl, threshold=step.threshold)
                if found:
                    await safe_tap(serial, cx, cy, delay_after=repeat_delay, label=f"Vòng lặp: {tpl}")
                    step_success = True
                    break

        if step_success:
            step_status = "success"
        else:
            step_status = "failed"
        scenario_tracker.set_step(step.id, step.name, cycle, rep, repeat_times, step_status, scenario_id=scenario_id)
        if not step_success:
            overall_success = False

        if rep < repeat_times:
            await asyncio.sleep(repeat_delay)

    return overall_success


def get_ordered_steps(scenario: Scenario) -> list[ScenarioStep]:
    """Lấy danh sách các bước theo thứ tự liên kết mũi tên do người dùng tự nối."""
    connections = getattr(scenario, "connections", None)
    if not connections:
        return [s for s in scenario.steps if s.enabled]

    step_dict = {s.id: s for s in scenario.steps}
    from_map: dict[str, list[str]] = {}
    in_degrees: dict[str, int] = {s.id: 0 for s in scenario.steps}
    connected_ids = set()

    for conn in connections:
        from_id = conn.from_id if hasattr(conn, "from_id") else conn.get("from_id")
        to_id = conn.to_id if hasattr(conn, "to_id") else conn.get("to_id")
        if from_id in step_dict and to_id in step_dict:
            from_map.setdefault(from_id, []).append(to_id)
            in_degrees[to_id] = in_degrees.get(to_id, 0) + 1
            connected_ids.add(from_id)
            connected_ids.add(to_id)

    if not connected_ids:
        return [s for s in scenario.steps if s.enabled]

    start_nodes = [s.id for s in scenario.steps if s.id in connected_ids and in_degrees.get(s.id, 0) == 0]
    if not start_nodes:
        start_nodes = [next(iter(connected_ids))]

    ordered: list[ScenarioStep] = []
    visited = set()
    queue = list(start_nodes)

    while queue:
        curr_id = queue.pop(0)
        if curr_id in visited:
            continue
        visited.add(curr_id)
        if curr_id in step_dict and step_dict[curr_id].enabled:
            ordered.append(step_dict[curr_id])
        for next_id in from_map.get(curr_id, []):
            if next_id not in visited:
                queue.append(next_id)

    for s in scenario.steps:
        if s.id in connected_ids and s.id not in visited and s.enabled:
            ordered.append(s)
            visited.add(s.id)

    return ordered if ordered else [s for s in scenario.steps if s.enabled]


async def execute_scenario_graph(
    serial: str,
    scenario: Scenario,
    all_scenarios_map: dict[str, Scenario],
    cycle: int,
    loop_count: int,
    depth: int,
    stop_step_id: str | None = None
) -> tuple[bool, bool]:
    """Thực thi kịch bản bằng máy trạng thái đồ thị (State Machine Graph Runner hỗ trợ rẽ nhánh If/Else). Trả về (should_break_cycles, success)."""
    tag         = "SCENARIO"
    connections = getattr(scenario, "connections", None)
    if not connections:
        connections = []

    step_dict = {s.id: s for s in scenario.steps}
    if not step_dict:
        return False, True

    # Tìm Node bắt đầu (Start Node): Là node có in-degree == 0, nếu không có thì lấy node đầu tiên
    in_degrees: dict[str, int] = {s.id: 0 for s in scenario.steps}
    for conn in connections:
        if hasattr(conn, "to_id"):
            to_id = conn.to_id
        else:
            to_id = conn.get("to_id")
        if to_id in in_degrees:
            in_degrees[to_id] = in_degrees[to_id] + 1

    start_candidates = [s for s in scenario.steps if s.enabled and in_degrees.get(s.id, 0) == 0]
    if start_candidates:
        current_step = start_candidates[0]
    else:
        current_step = scenario.steps[0]

    context = {
        "last_match_point": None,
        "matched_steps": {},
        "finished": False,
        "finish_status": None,
    }

    max_steps_limit = 200
    step_count      = 0
    success_all     = True

    while current_step is not None:
        if scenario_tracker.should_stop():
            log_manager.log("WARN", f"⏹ ĐÃ DỪNG KỊCH BẢN '{scenario.name}' THEO YÊU CẦU", tag)
            break

        step_count = step_count + 1
        if step_count > max_steps_limit:
            log_manager.log("ERROR", f"❌ [DỪNG] Vượt quá giới hạn {max_steps_limit} bước trong một chu kỳ (ngăn chặn lặp vô hạn)", tag)
            success_all = False
            break

        log_manager.log("INFO", f"--- [Vòng {cycle}/{loop_count} - Bước {step_count}] {current_step.name} ---", tag)
        step_start_time = time.time()
        step_ok = await execute_scenario_step(
            serial, current_step, all_scenarios_map, depth=depth, cycle=cycle, scenario_id=scenario.id, context=context
        )
        step_duration = round(time.time() - step_start_time, 2)

        branch_taken = "default"
        branch_name  = "Tiếp tục"
        if current_step.type in ["if_template", "template_tap", "run_scenario"]:
            if step_ok:
                branch_taken = "true"
                branch_name  = "CÓ (Đúng)"
            else:
                branch_taken = "false"
                branch_name  = "KHÔNG (Sai)"

        step_detail = ""
        if context is not None and "last_step_detail" in context:
            step_detail = context["last_step_detail"]

        scenario_tracker.record_step_execution({
            "step_id":      current_step.id,
            "step_name":    current_step.name,
            "step_type":    current_step.type,
            "cycle":        cycle,
            "success":      step_ok,
            "branch_taken": branch_taken,
            "branch_name":  branch_name,
            "duration_sec": step_duration,
            "detail":       step_detail,
            "time":         time.strftime("%H:%M:%S")
        })

        if stop_step_id and current_step.id == stop_step_id:
            log_manager.log("INFO", f"🚩 [RUN-UNTIL] Đã chạy tới bước chỉ định '{current_step.name}' (ID: {current_step.id}). Hoàn thành thử nghiệm và dừng kịch bản.", tag)
            if context is not None:
                context["stop_reached"] = True
            return True, success_all

        if current_step.type == "finish":
            is_ok = getattr(current_step, 'finish_status', 'success') == 'success'
            return True, is_ok

        if not step_ok:
            if current_step.type != "if_template":
                success_all = False

        # Tìm các mũi tên đi ra từ node hiện tại
        outgoing_conns = []
        for conn in connections:
            if hasattr(conn, "from_id"):
                c_from = conn.from_id
            else:
                c_from = conn.get("from_id")
            if c_from == current_step.id:
                outgoing_conns.append(conn)

        if not outgoing_conns:
            log_manager.log("INFO", f"🏁 Kết thúc nhánh tại bước '{current_step.name}'", tag)
            break

        next_step_id = None
        if current_step.type in ["if_template", "template_tap", "run_scenario"]:
            # Rẽ nhánh theo điều kiện Đúng (True) hoặc Sai (False)
            if step_ok:
                target_branch = "true"
                b_name        = "CÓ (True - Thành Công)"
            else:
                target_branch = "false"
                b_name        = "KHÔNG (False - Thất Bại)"

            matched_conn = None
            for conn in outgoing_conns:
                if hasattr(conn, "branch"):
                    b = conn.branch
                else:
                    b = conn.get("branch", "default")
                if not b:
                    b = "default"
                if b == target_branch:
                    matched_conn = conn
                    break

            if not matched_conn:
                for conn in outgoing_conns:
                    if hasattr(conn, "branch"):
                        b = conn.branch
                    else:
                        b = conn.get("branch", "default")
                    if not b:
                        b = "default"
                    if b == "default":
                        matched_conn = conn
                        break

            if matched_conn:
                if hasattr(matched_conn, "to_id"):
                    c_to = matched_conn.to_id
                else:
                    c_to = matched_conn.get("to_id")
                log_manager.log("INFO", f"🔀 [RẼ NHÁNH] Điều kiện: {b_name} ➔ Chuyển sang bước kế tiếp", tag)
                next_step_id = c_to
            else:
                log_manager.log("INFO", f"🏁 Không có đường nối phù hợp cho nhánh {b_name}, kết thúc luồng này", tag)
                break
        else:
            # Hành động thông thường: Ưu tiên default
            matched_conn = None
            for conn in outgoing_conns:
                if hasattr(conn, "branch"):
                    b = conn.branch
                else:
                    b = conn.get("branch", "default")
                if not b:
                    b = "default"
                if b == "default":
                    matched_conn = conn
                    break

            if not matched_conn:
                if outgoing_conns:
                    matched_conn = outgoing_conns[0]

            if matched_conn:
                if hasattr(matched_conn, "to_id"):
                    next_step_id = matched_conn.to_id
                else:
                    next_step_id = matched_conn.get("to_id")

        if next_step_id and next_step_id in step_dict:
            b_val = "default"
            if matched_conn:
                if hasattr(matched_conn, "branch"):
                    b_val = matched_conn.branch or "default"
                else:
                    b_val = matched_conn.get("branch", "default")
            scenario_tracker.set_active_connection(current_step.id, next_step_id, b_val)
            current_step = step_dict[next_step_id]
        else:
            break

    return False, success_all


async def execute_scenario(serial: str, scenario_id: str, depth: int = 0, stop_step_id: str | None = None) -> bool:
    """Thực thi toàn bộ kịch bản từ đầu đến cuối hoặc đến bước chỉ định stop_step_id."""
    if depth > 5:
        log_manager.log("ERROR", "Vượt quá độ sâu lồng kịch bản con (tránh vòng lặp vô tận)", "SCENARIO")
        return False

    scenarios = load_scenarios()
    sc_map    = {s.id: s for s in scenarios}
    scenario  = sc_map.get(scenario_id)

    if not scenario:
        log_manager.log("ERROR", f"Không tìm thấy kịch bản ID '{scenario_id}'", "SCENARIO")
        return False

    loop_count = max(1, getattr(scenario, 'loop_count', 1) or 1)
    loop_delay = max(0.1, getattr(scenario, 'loop_delay', 0.5) or 0.5)

    if depth == 0:
        scenario_tracker.start_report(scenario.id, scenario.name)

    scenario_tracker.push_scenario(scenario.id, scenario.name, loop_count)

    if stop_step_id:
        log_manager.log("INFO", f"🚩 BẮT ĐẦU THỬ NGHIỆM ĐẾN BƯỚC: ID '{stop_step_id}' trong kịch bản '{scenario.name}'", "SCENARIO")
    elif loop_count > 1:
        log_manager.log("INFO", f"🚀 BẮT ĐẦU KỊCH BẢN: '{scenario.name}' ({len(scenario.steps)} bước) - Lặp lại toàn bộ quy trình {loop_count} vòng (nghỉ {loop_delay}s/vòng)", "SCENARIO")
    else:
        log_manager.log("INFO", f"🚀 BẮT ĐẦU KỊCH BẢN: '{scenario.name}' ({len(scenario.steps)} bước)", "SCENARIO")

    start_time  = time.time()
    success_all = True
    context = None
    tag = "SCENARIO"

    try:
        has_connections = bool(getattr(scenario, "connections", None))
        for cycle in range(1, loop_count + 1):
            if scenario_tracker.should_stop():
                log_manager.log("WARN", f"⏹ ĐÃ DỪNG KỊCH BẢN '{scenario.name}' THEO YÊU CẦU", "SCENARIO")
                break

            if loop_count > 1:
                log_manager.log("INFO", f"🔄 === VÒNG LẶP {cycle}/{loop_count} CỦA QUY TRÌNH '{scenario.name}' ===", "SCENARIO")

            if has_connections:
                # Chạy theo máy trạng thái đồ thị (Graph Runner) rẽ nhánh linh hoạt
                should_break, ok = await execute_scenario_graph(serial, scenario, sc_map, cycle, loop_count, depth, stop_step_id=stop_step_id)
                if not ok:
                    success_all = False
                if should_break:
                    if stop_step_id:
                        log_manager.log("INFO", f"🏁 Đã hoàn tất chạy thử nghiệm đến bước chỉ định", "SCENARIO")
                    else:
                        log_manager.log("INFO", f"🏁 Kịch bản '{scenario.name}' dừng sớm theo lệnh Kết Thúc (bỏ qua các vòng lặp còn lại)", "SCENARIO")
                    break
            else:
                # Nếu không có mũi tên nào, chạy danh sách phẳng
                executable_steps = [s for s in scenario.steps if s.enabled]
                context          = {"last_match_point": None, "matched_steps": {}}
                for idx, step in enumerate(executable_steps, 1):
                    if scenario_tracker.should_stop():
                        log_manager.log("WARN", f"⏹ ĐÃ DỪNG KỊCH BẢN '{scenario.name}' THEO YÊU CẦU", "SCENARIO")
                        break
                    log_manager.log("INFO", f"--- [Vòng {cycle}/{loop_count} - Bước {idx}/{len(executable_steps)}] {step.name} ---", tag)
                    step_start_time = time.time()
                    ok = await execute_scenario_step(serial, step, sc_map, depth=depth, cycle=cycle, scenario_id=scenario.id, context=context)
                    step_duration = round(time.time() - step_start_time, 2)

                    step_detail = ""
                    if context is not None and "last_step_detail" in context:
                        step_detail = context["last_step_detail"]

                    scenario_tracker.record_step_execution({
                        "step_id":      step.id,
                        "step_name":    step.name,
                        "step_type":    step.type,
                        "cycle":        cycle,
                        "success":      ok,
                        "branch_taken": "default",
                        "branch_name":  "Tiếp tục",
                        "duration_sec": step_duration,
                        "detail":       step_detail,
                        "time":         time.strftime("%H:%M:%S")
                    })

                    if not ok:
                        if step.type != "if_template":
                            log_manager.log("WARN", f"Bước '{step.name}' thực hiện không thành công", tag)
                            success_all = False
                    if stop_step_id and step.id == stop_step_id:
                        log_manager.log("INFO", f"🚩 [RUN-UNTIL] Đã chạy tới bước chỉ định '{step.name}' (ID: {step.id}). Hoàn tất thử nghiệm.", tag)
                        context["finished"] = True
                        context["stop_reached"] = True
                        break
                    if context.get("finished"):
                        f_ok = (context.get("finish_status") == "success")
                        success_all = f_ok
                        break
                if context.get("finished"):
                    log_manager.log("INFO", f"🏁 Kịch bản '{scenario.name}' dừng sớm theo lệnh Kết Thúc (bỏ qua các vòng lặp còn lại)", tag)
                    break

            if cycle < loop_count:
                await asyncio.sleep(loop_delay)

        elapsed = round(time.time() - start_time, 1)
        if success_all:
            log_manager.log("INFO", f"✅ KỊCH BẢN '{scenario.name}' HOÀN TẤT THÀNH CÔNG (mất {elapsed}s)", tag)
        else:
            log_manager.log("WARN", f"⚠️ KỊCH BẢN '{scenario.name}' ĐÃ CHẠY XONG VỚI CẢNH BÁO (mất {elapsed}s)", tag)

        scenario.last_run_time = time.time()
        save_scenarios(list(sc_map.values()))
    finally:
        if depth == 0:
            if scenario_tracker.should_stop():
                stop_reason = "Người dùng yêu cầu dừng khẩn cấp"
            else:
                if stop_step_id:
                    stop_reason = f"Đã chạy tới bước chỉ định (ID: {stop_step_id})"
                else:
                    if context and context.get("finished"):
                        f_st = context.get("finish_status", "success")
                        stop_reason = f"Dừng theo hành động Kết Thúc ({f_st})"
                    else:
                        if success_all:
                            stop_reason = "Hoàn tất kịch bản thành công"
                        else:
                            stop_reason = "Kịch bản kết thúc (có bước không thành công)"
            scenario_tracker.finalize_report(scenario.id, scenario.name, success_all, stop_reason)
        scenario_tracker.pop_scenario(scenario.id)

    final_result = success_all
    return final_result


class ScenarioEngine:
    """Quản lý chạy nền các kịch bản định kỳ."""

    def __init__(self):
        self.is_running = False
        self.active_serial = ""
        self.task: asyncio.Task | None = None

    def start(self, serial: str):
        if self.is_running:
            return
        self.active_serial = serial
        self.is_running = True
        self.task = asyncio.create_task(self._run_loop())
        log_manager.log("INFO", f"▶ Scenario Engine ĐÃ BẬT cho thiết bị {serial}", "ENGINE")

    def stop(self):
        self.is_running = False
        if self.task and not self.task.done():
            self.task.cancel()
            self.task = None
        log_manager.log("INFO", "🛑 Scenario Engine ĐÃ DỪNG", "ENGINE")

    async def _run_loop(self):
        while self.is_running:
            try:
                scenarios = load_scenarios()
                now = time.time()
                for sc in scenarios:
                    if not self.is_running:
                        break
                    # Chi chay cac kich ban duoc bat va co interval > 0
                    if sc.enabled and sc.interval_minutes > 0:
                        interval_sec = sc.interval_minutes * 60
                        if now - sc.last_run_time >= interval_sec:
                            await execute_scenario(self.active_serial, sc.id)
                            # Nghi nhe giua cac kich ban
                            await asyncio.sleep(2.0)
                            now = time.time()
                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                log_manager.log("ERROR", f"Lỗi vòng lặp Scenario Engine: {e}", "ENGINE")
                await asyncio.sleep(3.0)

scenario_engine = ScenarioEngine()

