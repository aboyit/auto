# MASTER SPEC — BLUE​STACKS ISOMETRIC AUTO GAME STUDIO

**Phiên bản:** 1.0 | **Ngày:** 2026-10-28 | **Ngôn ngữ:** Tiếng Việt

> Tài liệu yêu cầu triển khai dành cho IDE AI. Xây dựng ứng dụng desktop-local điều khiển game Android chạy trong BlueStacks qua ADB, bản đồ isometric cố định, macro kéo-thả, có khả năng theo dõi camera và xử lý lỗi. Không cần source game, không sửa APK, không dựa vào AI trong runtime. Chỉ tự động hóa giao diện trên môi trường mà người dùng được phép sử dụng; không vượt cơ chế bảo vệ, chống gian lận hoặc truy cập trái phép.

## 0. Mục tiêu, phạm vi và định nghĩa hoàn thành

**Mục tiêu:** Người dùng có thể xem preview game, click/swipe để record, đăng ký công trình, tạo workflow bằng node, chạy task `Navigate → Detect → Tap → Verify`, chuyển sang task tiếp theo từ vị trí camera hiện tại mà không cần quay về Nhà Chính. Có logging, pause/resume/stop, xử lý popup và recovery.

**Đặc điểm game đã xác nhận:** Android BlueStacks; bản đồ isometric 45°, công trình cố định; camera kéo qua lại; nhiều HUD, icon, nhãn, thông báo, hiệu ứng; ảnh tham khảo ~274–281 px chiều ngang và ~486–491 px chiều cao (ảnh được chia sẻ có thể đã resize; kích thước thật phải lấy từ ADB). Nhà Chính được dùng làm gốc ban đầu, nhưng không dùng làm điểm bắt buộc giữa mọi task. Chưa xác nhận game có quán tính, zoom, xoay hay chức năng quay về Nhà Chính: tất cả phải có kiểm tra cấu hình, không giả định.

**Ngoài phạm vi MVP:** nhận diện mọi game, huấn luyện model AI lớn, sửa APK, chống phát hiện, bypass captcha, điều khiển nhiều máy đồng thời, tối ưu hóa game tự động bằng reinforcement learning.

**Định nghĩa hoàn thành MVP:** chạy được trên Windows; có ADB device selection; preview chính xác tỷ lệ; click/swipe từ preview; record và replay; quản lý ảnh template; đăng ký công trình; tracker xác nhận độ dịch chuyển; navigate đến công trình từ camera đã định vị; editor lưu graph; runtime có if/else, wait, detect, tap, swipe, navigate, verify, retry; pause/stop an toàn; lưu session/log/screenshots.

## 1. Kiến trúc

```text
React + TypeScript + Vite + @xyflow/react
 ├─ Device & Live Preview (canvas/ảnh)
 ├─ Macro Recorder + Timeline
 ├─ Workflow Graph Editor + Node Inspector
 ├─ Map Calibration + Building Registry
 ├─ Run Console + Screenshot Debugger
 └─ WebSocket realtime
          │ HTTP/WS localhost
Python FastAPI + Pydantic + SQLAlchemy + SQLite
 ├─ DeviceManager (serial, resolution, connection)
 ├─ ADBController (capture, tap, swipe, keyevent)
 ├─ FrameService (frame_id, timestamp, size, metadata)
 ├─ InputDispatcher (single queue per device; lock)
 ├─ VisionEngine (ROI masks, templates, ORB, optical flow)
 ├─ CameraTracker (offset, uncertainty, confidence)
 ├─ MapRegistry (buildings, landmarks, calibration)
 ├─ Navigator (plan, swipe, verify, replan)
 ├─ Recorder (events + before/after screenshots)
 ├─ WorkflowEngine (state machine + graph interpreter)
 ├─ PopupHandler (high-priority interrupt policy)
 └─ Persistence (SQLite + assets on disk)
          │
     ADB executable → BlueStacks
```

**Quy tắc:** Backend là nguồn sự thật duy nhất về camera, task, input. Mỗi device có đúng một hàng đợi lệnh input và một execution lock. Recorder và workflow không được điều khiển đồng thời. UI không trực tiếp gọi ADB. Không dùng lệnh shell ghép từ input người dùng; gọi subprocess bằng danh sách argv, timeout và kiểm tra serial. Chỉ bind localhost mặc định, không expose ADB/backend ra internet.

## 2. Công nghệ và môi trường

- Windows 10/11; BlueStacks với ADB bật; Python >=3.11; Node.js LTS; adb platform-tools.
- Python: `fastapi`, `uvicorn`, `pydantic`, `sqlalchemy`, `opencv-python`, `numpy`, `Pillow`, `pytest`, `httpx`, `websockets` (chọn đúng phiên bản tương thích khi khởi tạo).
- Frontend: `react`, `typescript`, `vite`, `@xyflow/react`, `zustand`, `tanstack-query` (hoặc fetch), `zod`.
- OCR optional: PaddleOCR hoặc EasyOCR, lazy-load; không bắt buộc MVP.
- SQLite để lưu workflow và registry; thư mục assets lưu PNG, mask, debug frame. Không lưu ảnh base64 vào database.
- Dùng `adb devices -l` để lấy serial thực tế; `127.0.0.1:5555` chỉ là ví dụ, không hardcode.

## 3. Hệ tọa độ và biến đổi

**Không trộn lẫn các hệ tọa độ:**

1. `device_px`: pixel ảnh gốc từ `adb exec-out screencap -p`, gốc trên trái, x sang phải, y xuống dưới.
2. `preview_css`: pixel CSS trong trình duyệt, chịu ảnh hưởng letterbox và scale. Phải quy đổi sang device_px bằng kích thước hiển thị thực và offset.
3. `map_global_px`: hệ tọa độ pixel bản đồ ảo, cùng trục x/y với ảnh khi zoom và hướng camera cố định. Gốc đặt tại landmark Nhà Chính hoặc điểm hiệu chỉnh.
4. `iso_world_uv`: tọa độ ô lưới isometric (nếu biết), không cần cho MVP.

Nếu camera `C=(cx,cy)` là tọa độ global của tâm màn hình và `S=(sx,sy)` là tọa độ trên màn hình, `H=(W/2,H/2)` thì `G = C + (S-H)`; `S = G-C+H` khi zoom không đổi. Cần định nghĩa rõ dấu: khi nội dung bản đồ dịch `(dx,dy)` trên ảnh, camera dịch `(-dx,-dy)` trong global pixel.

Nếu cần quy đổi lưới isometric: `screen_x = a*(u-v)+offset_x`, `screen_y=b*(u+v)+offset_y`; a/b phải hiệu chỉnh. Không giả định góc isometric 45° nghĩa là a=b hay ảnh không bị phối cảnh. Với zoom/rotation thay đổi, invalidation calibration và yêu cầu tái hiệu chỉnh; tùy chọn dùng affine/homography có kiểm tra.

**Building registry:** building_id, name, world_x/y, template_ids, bounding box/anchor offset, detection_roi, last_verified_at, confidence, notes, map_version. Vị trí click là anchor trên công trình, không nhất thiết là tâm sprite hay tâm nhãn.

## 4. ADB Controller và Preview

- Khám phá thiết bị: `adb devices -l`, chọn serial; `adb -s SERIAL shell wm size` chỉ là tham khảo, kích thước screenshot là chuẩn cuối.
- Screenshot: `adb -s SERIAL exec-out screencap -p` nhận PNG bytes, decode bằng `cv2.imdecode`; có retry giới hạn và timeout; không dùng `shell screencap` gây chuyển newline sai.
- Tap: `adb -s SERIAL shell input tap X Y`.
- Swipe: `adb -s SERIAL shell input swipe X1 Y1 X2 Y2 DURATION_MS`.
- Keyevent: `adb -s SERIAL shell input keyevent KEYCODE_BACK` khi đã cấu hình.
- Mỗi frame: `{frame_id, device_serial, width, height, captured_at, camera_state_version}`. Stream ảnh JPEG/WebP qua WS với FPS thích nghi 2–8 FPS; khi thao tác điều hướng có thể chụp snapshot PNG không mất dữ liệu.
- UI phải preserve aspect ratio; dùng transform từ client pointer sang ảnh gốc; clamp tọa độ; cảnh báo nếu click vào letterbox. Không thực thi click khi device disconnected hoặc run bị khóa.
- Input queue đảm bảo thứ tự, chống trùng lệnh; cancel token và stop giữa các bước. Khi `stop`, không khởi tạo thêm lệnh; lệnh swipe đang chạy không thể hủy giữa chừng bằng ADB thông thường, cần chờ timeout rồi dừng.

## 5. Camera Tracker: thiết kế có kiểm chứng

### 5.1 Vấn đề thực tế từ ảnh game

HUD tài nguyên phía trên, thanh chat/menu dưới, nhãn công trình, icon nổi, thông báo và hiệu ứng động tạo các match sai. Không được lấy mọi feature match làm camera motion. Ảnh chat được cung cấp có thể khác kích thước vì resize/crop: chỉ dùng cặp frame cùng device, cùng orientation, cùng resolution và không bị resize cho tracking chuẩn. Không tuyên bố có số đo dx/dy chính xác nếu chưa chạy kiểm thử trên ảnh gốc.

### 5.2 ROI và mask

- Config `hud_masks`: polygon/rect normalized [0,1] theo W,H, có thể chỉnh trực quan.
- Gợi ý khởi đầu theo ảnh tham khảo: loại phần đầu ~0–0.25H và cuối ~0.80–1.0H; không dùng cố định vì khu vực bản đồ hữu ích có thể nằm trong vùng này.
- Dynamic masks: các icon/label/animation đã phát hiện, popup, các vùng high temporal variance. Cho phép user vẽ vùng ignore.
- Phân vùng map thành tile grid; giới hạn số feature mỗi tile để tránh một công trình áp đảo.

### 5.3 Pipeline

1. `before` là screenshot chụp sát trước swipe; `after` chụp sau khi camera đã ổn định (dùng frame-difference convergence hoặc timeout; không giả định không quán tính).
2. Xác nhận cùng kích thước, cùng screen state `MAP`; nếu popup/loading xuất hiện, reject.
3. Tạo ROI mask từ HUD + popup + moving overlays; grayscale, CLAHE tùy chọn.
4. Optical Flow sparse: `goodFeaturesToTrack` + `calcOpticalFlowPyrLK`, forward-backward consistency, bỏ điểm sát viền và mask.
5. ORB: detect+compute, BFMatcher Hamming KNN ratio test, mutual check, spatial distribution; có thể dùng SIFT nếu phù hợp license/deployment, nhưng không phụ thuộc.
6. Ước lượng chuyển động map: RANSAC translation (median inlier dx/dy) hoặc `estimateAffinePartial2D` với rotation/scale constrained; không chọn cụm gần zero mặc định vì có thể là HUD. Phải xác nhận cụm motion trên nhiều vùng map độc lập.
7. Kết hợp optical-flow và ORB: nếu vector lệch nhau quá threshold, đánh dấu ambiguous. So với swipe intent chỉ là prior, không phải ground truth.
8. Kiểm tra `inlier_count`, `inlier_ratio`, `median_residual`, `spatial_coverage`, `motion_magnitude`, `flow_orb_agreement`, `stability`; trả `OK/LOW_CONFIDENCE/AMBIGUOUS/NO_FEATURES/SCREEN_CHANGED`.
9. Chỉ cập nhật camera khi OK; cập nhật `C_new=C_old-(dx,dy)` và uncertainty. Nếu không chắc, giữ trạng thái `LOST` hoặc `UNCERTAIN` và gọi recovery.
10. Chống drift: mỗi N swipe hoặc khi uncertainty tăng, tìm landmark đã đăng ký trong predicted ROI; hiệu chỉnh global pose nếu match đạt ngưỡng.

**Tracker output:** `{dx_screen,dy_screen,confidence,inliers,ratio,residual,coverage,status,debug_overlay_path}`. Không gán confidence 0.95 giả tạo; ban đầu dùng confidence heuristic có cấu hình và hiệu chỉnh bằng dataset thực tế.

**Quán tính:** capture chuỗi frame sau khi thả, đợi độ dịch chuyển nền nhỏ hơn epsilon trong K frame liên tiếp hoặc hết `settle_timeout_ms`. Nếu hết thời gian, không cập nhật pose như chắc chắn.

### 5.4 Đo đạc và debug

Ghi ảnh before/after, mask, keypoints, flow vectors, ORB matches, inliers/outliers, overlay và telemetry. Tạo CLI `python -m backend.tools.track_pair --before ... --after ... --mask ...` để đo offline. Tạo test với ảnh synthetic shift và overlay HUD cố định, dynamic effects, occlusion, resize mismatch.

## 6. Map Calibration và Registry

**Luồng hiệu chỉnh:**

1. Kết nối device, xác nhận resolution/orientation và zoom cố định.
2. Mở map, chọn Nhà Chính (hoặc landmark bất kỳ), click `Set Origin`, đặt camera pose tương ứng. Cần phân biệt click vị trí landmark và tâm camera; không tự coi click là tâm.
3. Click `Register Building`: chọn vùng sprite/anchor trên screenshot, nhập tên/id, lưu world point bằng `G=C+(S-H)`; tạo template đa trạng thái, ROI và mask.
4. Khi kéo camera qua preview, tracker cập nhật pose. Nếu mất track, yêu cầu relocalize trước khi đăng ký công trình mới.
5. Lưu landmark đa dạng ở các vùng khác nhau; mỗi landmark có template và global anchor đã biết. Ưu tiên nền/đường/đá độc đáo ít hiệu ứng.
6. Tạo `Map Debug`: điểm công trình, viewport hiện tại, đường đi dự kiến, uncertainty, lịch sử swipe, overlay match.
7. Cho phép sửa tọa độ bằng UI và rollback calibration. Khi đổi resolution/zoom/orientation, invalidate map calibration hoặc tính lại qua transform được kiểm chứng.

**Không suy diễn** rằng tên công trình luôn là target tốt: chữ và icon có thể chồng sprite. Template có thể dùng ảnh riêng từ khu vực ổn định, nhiều mẫu theo animation/level; bounding box phải tránh HUD.

## 7. Navigation Planner

**Input:** target building_id, camera pose, viewport size, safe_drag_region, swipe calibration, max_swipes, timeout.

**Thuật toán:**

```text
navigate(target):
  acquire device execution lock
  ensure screen state == MAP; handle known safe popup if allowed
  if camera status != TRACKED: relocalize() else fail NEEDS_RECOVERY
  for step in 1..max_swipes:
    capture frame; attempt target detect in predicted ROI
    if target visible and anchor clickable: return TARGET_VISIBLE(anchor_screen)
    compute delta = target_global - camera_global
    plan bounded swipe in safe region, respecting direction inversion
    capture before; execute swipe; wait for camera settle; capture after
    estimate camera motion with tracker
    if unreliable: relocalize or stop with diagnostic
    update pose; verify map state; check boundary/no-motion
  fail NAVIGATION_TIMEOUT
```

**Quan trọng:** Swipe vector là hướng kéo nội dung ngược chiều hướng cần đưa camera tới. Calibrate mapping `desired_camera_delta → swipe_drag_delta` bằng thử nghiệm an toàn 4 hướng, lưu gains/limits theo device và zoom. Không giả định swipe 300 px = camera 300 px. Dùng controller phản hồi, bước kéo ngắn dần khi gần target; không chạy open-loop nhiều swipe. Nếu camera chạm biên (swipe nhưng map motion ~0) thì ghi `BOUNDARY_REACHED`, không lặp vô hạn. Khi công trình xuất hiện, detect bằng ảnh và click anchor thực tế thay vì tính vị trí màn hình thuần từ tọa độ.

**Điều kiện thất bại:** target không tồn tại/đã đổi hình, map lost, screen not map, popup không xử lý được, boundary, timeout, user stop. Không click theo tọa độ dự đoán khi chưa verify.

## 8. Vision Engine / Screen State / Popup

- `match_template(template_id, frame, roi, threshold, scales)` trả bbox, score, center, frame_id; dùng grayscale/color tùy template, NMS, đa mẫu, check temporal 2–3 frame cho hành động nhạy.
- Không coi `matchTemplate` score là xác suất thống kê. Threshold riêng theo template, đo precision/recall trên dataset.
- `detect_screen_state`: MAP, BUILDING_DIALOG, CONFIRM_DIALOG, LOADING, UNKNOWN; dựa trên nhiều anchor ổn định, không dựa một ảnh.
- `PopupHandler`: whitelist popup có thể đóng an toàn (thông báo bình thường); policy `dismiss/skip/pause/manual`; không tự động nhấn nút có thể tiêu tài nguyên/tiền khi chưa được user cấu hình.
- OCR optional để đọc chữ và số khi cần; ưu tiên ảnh cho nút có icon ổn định.
- Tách detector, action và verifier; action success chỉ khi verify đạt điều kiện, không phải vì ADB trả exit code 0.

## 9. Visual Macro Recorder

**UX:** preview trực tiếp, nút Start/Pause/Stop Record, danh sách timeline, screenshot before/after từng event, chọn event để đổi kiểu node, nút Test Step, Undo/Redo, Save As Workflow.

**Chế độ MVP:** record mọi input do user thực hiện trên preview; backend ghi event có monotonic timestamp, device coords, screenshot_before, screenshot_after, camera_pose_before/after, screen_state, user annotation. Không hứa ghi được click trực tiếp vào cửa sổ BlueStacks khi chưa cài Windows hook; đó là phase riêng.

**Event:** `tap`, `swipe`, `keyevent`, `wait`; UI hỗ trợ chuyển:
- Tap absolute → `TapCoordinate` (khi màn hình cố định)
- Tap absolute → `FindImage → TapDetected` (người dùng khoanh ROI template và anchor offset)
- Tap vào building → `NavigateBuilding → DetectBuilding → TapDetected`
- Wait fixed → `WaitForImage`/`WaitForState`/`WaitUntil` với timeout
- Swipe map → `NavigateBuilding` (không replay số lần kéo cố định)

**Record event schema:**
```json
{
  "event_id":"evt_001", "type":"tap", "timestamp_ms":1830,
  "device_serial":"127.0.0.1:5555", "frame_id":"frame_001",
  "device_x":140,"device_y":220,
  "before_asset":"frames/before_001.png", "after_asset":"frames/after_001.png",
  "camera_pose":{"x":220,"y":-110,"status":"TRACKED"},
  "screen_state":"MAP"
}
```

**Lưu ý:** Ghi raw events là bước 1; tự suy ra điều kiện workflow từ screenshot chỉ là gợi ý, cần user xác nhận. Không dùng AI runtime để quyết định tap.

## 10. Workflow Editor & Engine

**Node types MVP:** `Start`, `End`, `NavigateBuilding`, `FindImage`, `TapCoordinate`, `TapDetected`, `Swipe`, `Wait`, `WaitForImage`, `WaitForState`, `IfElse`, `VerifyImage`, `KeyEvent`, `Retry`, `CallSubworkflow`, `SetVariable`, `Log`, `Fail`.

**Node config chung:** id, type, version, params, timeout_ms, retry_policy (max_attempts, backoff_ms), on_error, preconditions, expected_screen_state, idempotency_policy. Edges có source/target/handle (`success`, `failure`, `true`, `false`, `timeout`). Validate graph: Start duy nhất, node id unique, references hợp lệ, reachability, không cho cycle vô hạn (Loop cần max_iterations), không cho recursion subworkflow vô hạn.

**Ví dụ workflow:**
```json
{
 "id":"collect_farm","version":1,
 "nodes":[
  {"id":"start","type":"Start","params":{}},
  {"id":"nav","type":"NavigateBuilding","params":{"building_id":"farm_01"},"timeout_ms":30000},
  {"id":"detect","type":"FindImage","params":{"template_id":"farm_ready","roi":"map","threshold":0.87},"timeout_ms":5000},
  {"id":"tap","type":"TapDetected","params":{"source_node_id":"detect"}},
  {"id":"confirm","type":"WaitForImage","params":{"template_id":"confirm_button"},"timeout_ms":5000},
  {"id":"tap_confirm","type":"TapDetected","params":{"source_node_id":"confirm"}},
  {"id":"verify","type":"VerifyImage","params":{"template_id":"harvest_success"},"timeout_ms":6000},
  {"id":"end","type":"End","params":{}}
 ],
 "edges":[
  {"source":"start","target":"nav","handle":"success"},
  {"source":"nav","target":"detect","handle":"success"},
  {"source":"detect","target":"tap","handle":"found"},
  {"source":"tap","target":"confirm","handle":"success"},
  {"source":"confirm","target":"tap_confirm","handle":"found"},
  {"source":"tap_confirm","target":"verify","handle":"success"},
  {"source":"verify","target":"end","handle":"success"}
 ]
}
```

**Engine:** state machine `PENDING/RUNNING/PAUSED/RETRYING/RECOVERING/SUCCESS/FAILED/CANCELLED`; mỗi node emit events, save checkpoint. Stop/pause kiểm tra giữa các thao tác. On failure chọn edge hoặc policy, không mặc định skip; retry idempotency-aware (đặc biệt với hành động đã gửi nhưng chưa verify). Sau restart, không tự replay hành động không idempotent nếu trạng thái chưa biết. Graph runtime chạy server, không chạy trong React.

**Task Scheduler phase 2:** queue, cooldown, dependency, priority, max attempts; lựa chọn task tiếp theo dựa camera hiện tại nếu phù hợp, không bắt buộc về Nhà Chính.

## 11. Database

Các bảng (SQLAlchemy migrations/Alembic):

- `devices(id, serial, name, resolution_w, resolution_h, status, updated_at)`
- `map_profiles(id, name, device_id, resolution_w, resolution_h, zoom_signature, origin_x, origin_y, version)`
- `camera_sessions(id, map_profile_id, pose_x, pose_y, uncertainty, status, last_verified_at)`
- `buildings(id, map_profile_id, name, world_x, world_y, anchor_x, anchor_y, metadata_json)`
- `landmarks(id, map_profile_id, world_x, world_y, template_id, quality, metadata_json)`
- `templates(id, name, path, width, height, threshold, roi_json, mask_path, tags_json)`
- `recordings(id, device_id, name, started_at, stopped_at, status)`
- `record_events(id, recording_id, sequence, type, payload_json, before_path, after_path)`
- `workflows(id, name, version, graph_json, created_at, updated_at)`
- `runs(id, workflow_id, device_id, status, started_at, ended_at, error_code)`
- `run_steps(id, run_id, node_id, attempt, status, started_at, ended_at, output_json, screenshot_path)`
- `settings(key, value_json)`

Lưu file assets theo UUID an toàn; validate path để ngăn path traversal; hỗ trợ export/import project ZIP có manifest, không execute nội dung nhập.

## 12. API REST & WebSocket

- `GET /api/health`
- `GET /api/devices`, `POST /api/devices/{serial}/connect`
- `GET /api/devices/{serial}/frame` (snapshot)
- `POST /api/devices/{serial}/tap`, `/swipe`, `/keyevent` (validated payload; input lock)
- `GET /api/map/profiles`, `POST /api/map/profiles`
- `POST /api/map/{id}/origin`, `/buildings`, `/landmarks`, `/relocalize`
- `GET /api/map/{id}/buildings`, `POST /api/map/{id}/navigate`
- `POST /api/recordings/start`, `/stop`, `/events`, `GET /api/recordings/{id}`
- `POST /api/templates`, `GET /api/templates`, `POST /api/vision/match`
- `GET/POST /api/workflows`, `GET/PUT /api/workflows/{id}`, `POST /api/workflows/{id}/validate`
- `POST /api/runs`, `POST /api/runs/{id}/pause|resume|stop`, `GET /api/runs/{id}`
- `WS /ws/devices/{serial}/frames` (binary image + metadata framing)
- `WS /ws/runs/{run_id}/events` (structured JSON progress)

**API standards:** Pydantic validation, error codes stable (`ADB_DISCONNECTED`, `CAMERA_LOST`, `SCREEN_STATE_MISMATCH`, `TARGET_NOT_FOUND`, `NAV_TIMEOUT`, `INPUT_BUSY`, `STOPPED`, `UNKNOWN_OUTCOME`), request_id, timestamps, clear HTTP status. CORS allowlist localhost dev origin. Avoid accepting arbitrary ADB shell commands from frontend.

## 13. Frontend screens

1. **Dashboard:** device connect, resolution, current task, camera confidence, logs.
2. **Game Preview:** frame stream, click/swipe, aspect-fit coordinates, record, FPS, screenshot capture.
3. **Map Calibration:** Set Origin, register building/landmark, draw ROI masks, debug map overlay, navigate test.
4. **Template Manager:** crop region, masks, threshold slider, test against positive/negative frames, anchor offset.
5. **Macro Studio:** recording timeline, screenshots, convert event → smart nodes.
6. **Workflow Editor:** React Flow palette, drag/drop, handles, inspector, validation, save/version, test step, execute.
7. **Run Console:** current node, status, retries, debug images, pause/resume/stop, export logs.

Accessibility: controls labeled, confirmation for destructive clicks, visual feedback of active device. UI never claims a node succeeded until backend emits verified success.

## 14. Project structure

```text
isometric-auto-studio/
├── README.md
├── docs/{ARCHITECTURE.md,API.md,CALIBRATION.md,TEST_PLAN.md}
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── api/{devices.py,map.py,vision.py,recordings.py,workflows.py,runs.py}
│   │   ├── core/{config.py,errors.py,events.py,locks.py}
│   │   ├── adb/{client.py,frames.py,controller.py}
│   │   ├── vision/{masks.py,optical_flow.py,orb.py,template.py,screen_state.py}
│   │   ├── mapping/{camera_tracker.py,calibration.py,registry.py,navigator.py,relocalizer.py}
│   │   ├── macro/{recorder.py,schemas.py,compiler.py,engine.py,nodes.py,recovery.py}
│   │   ├── db/{models.py,session.py,migrations/}
│   │   └── services/{device_manager.py,frame_service.py,input_dispatcher.py}
│   ├── tools/{track_pair.py,calibrate_swipe.py}
│   └── tests/{unit/,integration/,fixtures/}
├── frontend/
│   ├── package.json
│   └── src/
│       ├── api/
│       ├── components/{GamePreview/,WorkflowEditor/,NodeInspector/,MapCanvas/,Recorder/}
│       ├── pages/{Dashboard,Calibration,MacroStudio,Workflows,RunConsole}.tsx
│       ├── stores/
│       └── types/
└── data/{profiles/,templates/,recordings/,runs/}
```

## 15. Giai đoạn triển khai — bắt buộc code chạy từng phần

### Phase 0: Bootstrap (acceptance)
- Repo, backend FastAPI, frontend Vite/React TS, SQLite, config env, README.
- `GET /health`, frontend hiển thị kết nối; test và lint chạy được.

### Phase 1: ADB + preview + input (acceptance)
- Discover/select device, frame streaming, aspect ratio chuẩn, tap/swipe đúng tọa độ, reconnect và timeout.
- Test bằng một tap vào UI vô hại; đối chiếu pointer transform khi preview resize.

### Phase 2: Recorder (acceptance)
- Start/stop, ghi sự kiện từ preview, screenshot trước/sau, timeline, save/reload, replay có pause/stop.
- Test với 3 tap + 1 swipe, verify event order và screenshots.

### Phase 3: Vision (acceptance)
- Crop template, mask, find image, debug bbox, nhiều ảnh mẫu, wait for image, screen state.
- Test positive/negative trên frames; không click khi template ambiguous.

### Phase 4: Camera Tracker (acceptance)
- Optical Flow + ORB + RANSAC + mask + debug; settle detection; pose status.
- Synthetic test: dịch map 100px trong khi HUD đứng yên; kết quả dx gần 100px trong sai số xác định; reject mismatch/no features.

### Phase 5: Calibration + navigation (acceptance)
- Set origin, register 3 buildings, click anchor, navigate theo feedback, re-localize landmark.
- Test A→B→C→A từ các camera pose đã track; dừng an toàn nếu mất track hoặc boundary.

### Phase 6: Visual graph engine (acceptance)
- React Flow node editor, schema validation, graph execution, branch, timeout, retry, screenshot log.
- Demo task `Navigate → Detect → Tap → WaitFor → Tap → Verify` có nhánh failure.

### Phase 7: Reliability (acceptance)
- Popup interrupts, retry idempotency, unknown outcome, run recovery, run history, export/import.
- Test device disconnect, popup giữa task, user stop, mất landmark, app restart.

**Không làm tất cả trong một lần trả lời IDE.** Mỗi phase yêu cầu source thật, unit/integration tests, README, cách chạy và checklist nghiệm thu; chỉ chuyển phase khi phase hiện tại chạy được.

## 16. Test plan & KPI

- Test tọa độ: resize preview, letterbox, DPI scaling, orientation; click lệch tối đa 1–2 device px do rounding.
- Test tracker offline: synthetic translation với static HUD + dynamic sprites; đo median error, inlier coverage, false acceptance.
- Test navigation: ít nhất 20 lần A→B từ nhiều vị trí; ghi tỷ lệ đến đúng target, số swipe, thời gian, lần recovery. Không cam kết % khi chưa có dataset.
- Test vision: ít nhất 20 positive + 20 negative cho mỗi template quan trọng; đánh giá false positive trước khi bật auto click.
- Test macro: record→save→reload→replay; timeout và branch đúng.
- Test an toàn: device disconnect, user stop, popup lạ, stale screenshot, click trùng, camera LOST; không click bừa.
- Test performance: preview 2–8 FPS trên localhost tùy máy; tracker chạy trong thời gian hợp lý, đo latency thực tế; không có memory leak sau 1 giờ chạy.

## 17. Những lỗi thiết kế phải tránh

1. Tìm Nhà Chính bằng ảnh toàn màn hình trước mỗi task.
2. Tính camera delta trực tiếp bằng `swipe end-start` không đo hình ảnh.
3. Lấy cụm match gần zero làm map motion khi HUD cố định.
4. Chạy OCR hoặc template matching trên mọi pixel mọi frame không mask/ROI.
5. Chụp ảnh khi camera còn quán tính rồi cập nhật pose chắc chắn.
6. Replay raw swipe để navigate đến công trình cố định.
7. Coi ADB exit code 0 là task thành công.
8. Tự click khi pose `LOST` hoặc image match ambiguous.
9. Cho Recorder và Runner gửi input song song.
10. Hardcode BlueStacks port, resolution, zoom, tọa độ hoặc giả định có nút Home.
11. Không có timeout/retry bound hoặc vòng lặp vô hạn.
12. Dùng code giả (mock) rồi báo hoàn thành integration thực tế.

## 18. Prompt cho AI IDE (copy nguyên phần này)

Bạn là Senior Python Computer Vision Engineer, Senior React/TypeScript Engineer và Software Architect. Hãy triển khai dự án `isometric-auto-studio` theo toàn bộ tài liệu MASTER_SPEC.md. Đây là ứng dụng Windows-local dùng ADB để điều khiển BlueStacks; game có bản đồ isometric 45°, công trình cố định, HUD và icon nổi che nhiều vùng bản đồ. Runtime không dùng AI; chỉ dùng thuật toán CV, state machine và macro do người dùng định nghĩa.

**Quy tắc làm việc bắt buộc:**
1. Đọc toàn bộ MASTER_SPEC.md trước khi code. Kiểm tra repo hiện có, không xóa hoặc ghi đè code hoạt động nếu không cần.
2. Triển khai tuần tự Phase 0→7, nhưng trước tiên chỉ thực hiện Phase 0 và Phase 1. Mỗi phase phải có code chạy được, test, README, API mẫu và hướng dẫn test thực tế.
3. Không giả lập ADB success trong production. Nếu chưa có BlueStacks để thử, cung cấp FakeADB riêng cho unit tests và đánh dấu integration chưa xác nhận.
4. Backend quản lý single input queue, camera pose và workflow state; frontend không gọi ADB trực tiếp.
5. Camera tracking phải mask HUD, dùng Optical Flow + ORB/RANSAC, đo confidence, reject ambiguous, không cập nhật camera khi chưa xác thực.
6. Navigation dùng closed-loop: swipe→wait settle→screenshot→track→replan; dừng khi camera lost. Không cần quay về Nhà Chính giữa task.
7. Recorder phải ghi screenshot before/after và có khả năng chuyển click thành FindImage/TapDetected hoặc NavigateBuilding.
8. Workflow phải validate graph và có timeout, retry giới hạn, cancel, pause, verify; không chạy vô hạn.
9. Viết code có type hints, Pydantic schemas, error codes, logging, tests. Không hardcode serial 5555, resolution hay tọa độ.
10. Sau mỗi phase báo: file đã tạo/sửa, lệnh chạy, test pass/fail, chức năng đã kiểm thử thật, chức năng chưa hoàn thành, vấn đề còn tồn tại và đề xuất phase tiếp.

**Bắt đầu ngay:** triển khai Phase 0 + Phase 1, tạo project, backend ADB adapter, device discovery, screenshot streaming, input tap/swipe, frontend GamePreview với mapping pointer chính xác và test tương ứng. Không chỉ trả lời mô tả; hãy tạo source code thực tế.

## 19. Cách chạy dự kiến sau Phase 1

```powershell
# terminal 1 — kiểm tra ADB
adb devices -l

# terminal 2 — backend
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# terminal 3 — frontend
cd frontend
npm install
npm run dev
```

Mở `http://127.0.0.1:5173`, chọn thiết bị từ danh sách, kiểm tra preview và thử click/swipe. Chỉ thiết lập `ADB_SERIAL` nếu backend hỗ trợ override và đã xác nhận serial qua `adb devices -l`.

## 20. Những dữ liệu cần lấy từ game thật khi chạy

- Ảnh gốc PNG từ ADB (không dùng ảnh chat resize làm ground truth).
- 5–10 cặp before/after cho swipe bốn hướng, có cả kéo ngắn và dài.
- Ảnh chuỗi sau khi thả tay để đo quán tính.
- 3–5 công trình khác nhau và ảnh nhiều trạng thái.
- HUD masks, vùng kéo an toàn, màn hình popup thường gặp.
- Thông tin zoom có đổi không, orientation có cố định không, game có nút về map/home không.

**Nguyên tắc cuối:** Cần xây hệ thống đáng tin cậy trước, sau đó mới mở rộng số task. Độ tin cậy của camera pose và điều kiện verify quan trọng hơn số lượng macro.
