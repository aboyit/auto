"""Cac ham dung chung cho tat ca module auto."""

import asyncio
from pathlib import Path
import cv2
import numpy as np

from app.core.config import TEMPLATES_DIR
from app.core.logger import log_manager
from app.services.dispatcher import input_dispatcher, frame_service

async def safe_tap(serial: str, x: int, y: int, delay_after: float = 1.0, label: str = "") -> bool:
    name = label if label else "Vị trí"
    if x <= 0 or y <= 0:
        log_manager.log("WARN", f"❌ Chưa gán tọa độ hợp lệ cho '{name}' ({x}, {y})", "ACTION")
        return False
    log_manager.log("INFO", f"👉 [NHẤN] {name} tại tọa độ ({x}, {y})", "ACTION")
    ok = await input_dispatcher.tap(serial, x, y)
    if ok:
        log_manager.log("INFO", f"✔ [NHẤN THÀNH CÔNG] {name} ({x}, {y}) - nghỉ {delay_after}s", "ACTION")
    else:
        log_manager.log("ERROR", f"❌ [NHẤN THẤT BÀI] {name} ({x}, {y}) không phản hồi", "ACTION")
    if delay_after > 0:
        await asyncio.sleep(delay_after)
    return ok

def save_template_at_point(serial: str, x: int, y: int, filename: str, radius: int = 35) -> bool:
    log_manager.log("INFO", f"✂️ [CẮT ẢNH MẪU] Bắt đầu cắt '{filename}' tại tâm ({x}, {y}) bán kính {radius}px...", "VISION")
    try:
        image, _      = frame_service.capture_frame(serial)
        height, width = image.shape[:2]
        x1            = max(0, x - radius)
        y1            = max(0, y - radius)
        x2            = min(width, x + radius)
        y2            = min(height, y + radius)
        template      = image[y1:y2, x1:x2]
        if template.size == 0:
            log_manager.log("ERROR", f"❌ [CẮT ẢNH THẤT BÀI] Vùng cắt '{filename}' có kích thước rỗng", "VISION")
            return False
        template_file = TEMPLATES_DIR / filename
        saved         = cv2.imwrite(str(template_file), template)
        if saved:
            log_manager.log("INFO", f"✔ [CẮT ẢNH THÀNH CÔNG] Đã lưu mẫu nhận diện '{filename}' ({template.shape[1]}x{template.shape[0]}px)", "VISION")
            return True
        else:
            log_manager.log("ERROR", f"❌ [CẮT ẢNH THẤT BÀI] Không thể ghi tệp '{filename}' vào đĩa", "VISION")
            return False
    except Exception as e:
        log_manager.log("ERROR", f"❌ [CẮT ẢNH LỖI] {e}", "VISION")
        return False

def save_template_crop_box(serial: str, x1: int, y1: int, x2: int, y2: int, filename: str) -> bool:
    """Cắt ảnh mẫu theo vùng hình chữ nhật do người dùng khoanh trực tiếp trên game."""
    left   = min(x1, x2)
    right  = max(x1, x2)
    top    = min(y1, y2)
    bottom = max(y1, y2)
    w      = right - left
    h      = bottom - top
    log_manager.log("INFO", f"✂️ [KHOANH VÙNG CẮT] Cắt ảnh '{filename}' theo vùng ({left}, {top}) đến ({right}, {bottom}) [{w}x{h}px]...", "VISION")
    try:
        image, _       = frame_service.capture_frame(serial)
        img_h, img_w   = image.shape[:2]
        crop_x1        = max(0, min(img_w, left))
        crop_y1        = max(0, min(img_h, top))
        crop_x2        = max(0, min(img_w, right))
        crop_y2        = max(0, min(img_h, bottom))

        # Nếu vùng khoanh quá bé (< 10px), mở rộng bán kính tối thiểu 35px quanh tâm
        if (crop_x2 - crop_x1) < 10 or (crop_y2 - crop_y1) < 10:
            center_x = (crop_x1 + crop_x2) // 2
            center_y = (crop_y1 + crop_y2) // 2
            crop_x1  = max(0, center_x - 35)
            crop_y1  = max(0, center_y - 35)
            crop_x2  = min(img_w, center_x + 35)
            crop_y2  = min(img_h, center_y + 35)

        template = image[crop_y1:crop_y2, crop_x1:crop_x2]
        if template.size == 0:
            log_manager.log("ERROR", f"❌ [KHOANH VÙNG THẤT BÀI] Vùng cắt '{filename}' rỗng", "VISION")
            return False

        template_file = TEMPLATES_DIR / filename
        saved         = cv2.imwrite(str(template_file), template)
        if saved:
            log_manager.log("INFO", f"✔ [CẮT VÙNG THÀNH CÔNG] Đã lưu mẫu khoanh '{filename}' kích thước ({template.shape[1]}x{template.shape[0]}px)", "VISION")
            return True
        else:
            log_manager.log("ERROR", f"❌ [KHOANH VÙNG THẤT BÀI] Không thể ghi tệp '{filename}' vào đĩa", "VISION")
            return False
    except Exception as e:
        log_manager.log("ERROR", f"❌ [KHOANH VÙNG LỖI] {e}", "VISION")
        return False

def is_template_visible(serial: str, x: int, y: int, filename: str, threshold: float = 0.84, search_radius: int = 48) -> tuple[bool, float]:
    template_file = TEMPLATES_DIR / filename
    template = cv2.imread(str(template_file), cv2.IMREAD_COLOR)
    if template is None:
        return False, 0.0
    image, _ = frame_service.capture_frame(serial)
    image_height, image_width = image.shape[:2]
    template_height, template_width = template.shape[:2]
    x1 = max(0, x - search_radius)
    y1 = max(0, y - search_radius)
    x2 = min(image_width, x + search_radius)
    y2 = min(image_height, y + search_radius)
    search_area = image[y1:y2, x1:x2]
    if search_area.shape[0] < template_height or search_area.shape[1] < template_width:
        return False, 0.0
    result = cv2.matchTemplate(search_area, template, cv2.TM_CCOEFF_NORMED)
    _, confidence, _, _ = cv2.minMaxLoc(result)
    visible = confidence >= threshold
    return visible, float(confidence)

TEMPLATE_MAIN_CITY = "main_city_tag.png"

def is_main_city_screen(serial: str, threshold: float = 0.80) -> tuple[bool, float]:
    """Kiểm tra xem thiết bị có đang ở màn hình chính trong thành hay không (nhận diện nút Xuất Thành)."""
    template_file = TEMPLATES_DIR / TEMPLATE_MAIN_CITY
    template = cv2.imread(str(template_file), cv2.IMREAD_COLOR)
    if template is None:
        return False, 0.0
    image, _ = frame_service.capture_frame(serial)
    h, w = image.shape[:2]
    # Quét góc dưới bên phải màn hình (nút Xuất Thành)
    y1 = max(0, int(h * 0.88))
    x1 = max(0, int(w * 0.70))
    roi = image[y1:h, x1:w]
    if roi.shape[0] < template.shape[0] or roi.shape[1] < template.shape[1]:
        return False, 0.0
    result = cv2.matchTemplate(roi, template, cv2.TM_CCOEFF_NORMED)
    _, max_val, _, _ = cv2.minMaxLoc(result)
    is_city = max_val >= threshold
    return is_city, float(max_val)

async def ensure_main_city_screen(serial: str, max_steps: int = 5) -> bool:
    """Đảm bảo game đang ở màn hình chính trong thành trước khi chạy các auto trong thành."""
    in_city, conf = is_main_city_screen(serial)
    if in_city:
        return True

    log_manager.log("INFO", f"Game chưa ở màn hình chính trong thành (độ khớp {conf:.2f}), đang đóng popup/menu dang dở...", "NAV")

    for step in range(1, max_steps + 1):
        # 1. Thử nhấn nút Quay lại ở góc dưới bên trái (80, 1240) - an toàn hơn keyevent 4
        await input_dispatcher.tap(serial, 80, 1240)
        await asyncio.sleep(0.8)

        in_city, conf = is_main_city_screen(serial)
        if in_city:
            log_manager.log("INFO", f"Đã trở về màn hình chính trong thành sau {step} lần thoát", "NAV")
            return True

        # 2. Nếu chưa về, thử bấm phím Back của Android
        await input_dispatcher.keyevent(serial, 4)
        await asyncio.sleep(0.8)

        # Đề phòng xuất hiện popup 'Vuốt lần nữa sẽ thoát trò chơi', bấm nút X hoặc Hủy bỏ để đóng
        await input_dispatcher.tap(serial, 660, 340)
        await asyncio.sleep(0.5)

        in_city, conf = is_main_city_screen(serial)
        if in_city:
            log_manager.log("INFO", f"Đã trở về màn hình chính trong thành sau {step} lần thoát", "NAV")
            return True

        # 3. Nếu qua 2 lần mà vẫn chưa về (có thể có popup sự kiện cần chạm ra ngoài)
        if step >= 2:
            await input_dispatcher.tap(serial, 360, 200)
            await asyncio.sleep(0.7)
            in_city, conf = is_main_city_screen(serial)
            if in_city:
                log_manager.log("INFO", "Đã trở về màn hình chính trong thành sau khi đóng popup", "NAV")
                return True

    log_manager.log("WARN", f"Chưa thể xác nhận màn hình chính trong thành sau {max_steps} lần thử", "NAV")
    return False

def find_button_by_template(
    serial: str,
    filename: str,
    threshold: float = 0.70,
    region: tuple[float, float, float, float] = (0.50, 0.70, 1.0, 1.0)
) -> tuple[bool, int, int, float]:
    """
    Tìm vị trí nút theo ảnh mẫu trong vùng màn hình (mặc định góc dưới bên phải).
    Nếu không tìm thấy trong vùng góc phải, sẽ tìm trên toàn màn hình.
    Trả về: (found, center_x, center_y, confidence)
    """
    template_file = TEMPLATES_DIR / filename
    if not template_file.is_file():
        return False, 0, 0, 0.0

    template = cv2.imread(str(template_file), cv2.IMREAD_COLOR)
    if template is None:
        return False, 0, 0, 0.0

    image, _ = frame_service.capture_frame(serial)
    img_h, img_w = image.shape[:2]
    th, tw = template.shape[:2]

    # 1. Tìm trong vùng chỉ định (ví dụ góc dưới bên phải)
    rx1 = int(img_w * region[0])
    ry1 = int(img_h * region[1])
    rx2 = int(img_w * region[2])
    ry2 = int(img_h * region[3])
    roi = image[ry1:ry2, rx1:rx2]

    max_conf = 0.0

    if roi.shape[0] >= th and roi.shape[1] >= tw:
        res_roi = cv2.matchTemplate(roi, template, cv2.TM_CCOEFF_NORMED)
        _, val_roi, _, loc_roi = cv2.minMaxLoc(res_roi)
        max_conf = float(val_roi)
        if val_roi >= threshold:
            center_x = rx1 + loc_roi[0] + tw // 2
            center_y = ry1 + loc_roi[1] + th // 2
            return True, center_x, center_y, max_conf

    # 2. Preserve the existing full-screen fallback at the original scale.
    if img_h >= th and img_w >= tw:
        res_full = cv2.matchTemplate(image, template, cv2.TM_CCOEFF_NORMED)
        _, val_full, _, loc_full = cv2.minMaxLoc(res_full)
        if np.isfinite(val_full):
            max_conf = max(max_conf, float(val_full))
            if val_full >= threshold:
                return True, loc_full[0] + tw // 2, loc_full[1] + th // 2, float(val_full)

    # Scale changes occur when templates and device screenshots use different resolutions.
    # Keep the original threshold: a lower threshold would increase accidental taps.
    if float(np.std(template)) < 2.0:
        return False, 0, 0, max_conf
    best_point = (0, 0)
    best_scale = 1.0
    for scale in (0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95,
                  1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5,
                  1.55, 1.6, 1.65, 1.7, 1.75, 1.8, 1.85, 1.9, 1.95, 2.0):
        width, height = round(tw * scale), round(th * scale)
        if width < 8 or height < 8 or width > img_w or height > img_h:
            continue
        resized = cv2.resize(template, (width, height), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
        result = cv2.matchTemplate(image, resized, cv2.TM_CCOEFF_NORMED)
        _, confidence, _, location = cv2.minMaxLoc(result)
        if np.isfinite(confidence) and confidence > max_conf:
            max_conf = float(confidence)
            best_point = (location[0] + width // 2, location[1] + height // 2)
            best_scale = scale
    if max_conf >= threshold and best_point != (0, 0):
        log_manager.log("INFO", f"[VISION] '{filename}' scale={best_scale:.2f} confidence={max_conf:.3f} at {best_point}", "VISION")
        return True, best_point[0], best_point[1], max_conf
    return False, 0, 0, max_conf

async def execute_back_navigation(serial: str, custom_cfg=None) -> bool:
    """
    Quy trình Trở Về & Đóng Popup / Thoát an toàn:
    1. Kiểm tra lặp xem có nút Trở Về (icon góc trái) hoặc nút X (icon góc trên phải) không.
       Nếu có thì nhấn nút đó và kiểm tra tiếp.
    2. Chạm vào popup 1 cái để đóng các thông báo nổi.
    3. Vuốt kéo camera xuống cuối map (vùng tuyết).
    4. Nhấn vào vùng tuyết an toàn (không có nhà) để bỏ chọn công trình.
    """
    from app.core.auto_config import load_config
    if custom_cfg is not None:
        cfg = custom_cfg
    else:
        loaded = load_config()
        cfg = loaded.back_nav

    log_manager.log("INFO", "🔙 Đang thực hiện quy trình Trở Về & Đóng Popup...", "NAV")

    # Danh sách các ảnh mẫu nút Trở Về và nút Đóng X (hỗ trợ nhiều ảnh)
    back_tpl_list = list(dict.fromkeys([t for t in (getattr(cfg, 'back_templates', []) or []) + [cfg.back_template] if t]))
    close_x_tpl_list = list(dict.fromkeys([t for t in (getattr(cfg, 'close_x_templates', []) or []) + [cfg.close_x_template] if t]))

    # Vòng lặp kiểm tra nút Trở Về và nút X
    max_steps = max(1, cfg.max_retries)
    for step in range(1, max_steps + 1):
        action_performed = False

        # 1. Quét danh sách các ảnh mẫu nút Trở Về (icon góc trái)
        for tpl in back_tpl_list:
            found_back, bx, by, b_conf = find_button_by_template(
                serial,
                tpl,
                threshold=0.72,
                region=(0.0, 0.70, 0.35, 1.0)
            )
            if found_back:
                log_manager.log("INFO", f"Phát hiện nút Trở Về [{tpl}] ({b_conf:.2f}) tại ({bx}, {by})", "NAV")
                await safe_tap(serial, bx, by, delay_after=0.8, label=f"Nút Trở Về ({tpl})")
                action_performed = True
                break

        if action_performed:
            continue

        # 2. Quét danh sách các ảnh mẫu nút Đóng X (icon góc trên phải)
        for tpl in close_x_tpl_list:
            found_x, xx, xy, x_conf = find_button_by_template(
                serial,
                tpl,
                threshold=0.72,
                region=(0.60, 0.0, 1.0, 0.35)
            )
            if found_x:
                log_manager.log("INFO", f"Phát hiện nút Đóng X [{tpl}] ({x_conf:.2f}) tại ({xx}, {xy})", "NAV")
                await safe_tap(serial, xx, xy, delay_after=0.8, label=f"Nút Đóng X ({tpl})")
                action_performed = True
                break

        if action_performed:
            continue

        # Nếu không còn cả nút Trở Về lẫn nút X thì dừng vòng lặp nút
        break

    # 3. Chạm vào popup 1 cái để đóng thông báo nổi (nếu có)
    if cfg.popup_tap.x > 0 and cfg.popup_tap.y > 0:
        await safe_tap(serial, cfg.popup_tap.x, cfg.popup_tap.y, delay_after=0.6, label="Chạm popup để đóng")

    # 4. Kéo màn hình xuống cuối map (vùng tuyết)
    if cfg.swipe_from.x > 0 and cfg.swipe_to.x > 0:
        log_manager.log("INFO", f"Đang kéo màn hình xuống cuối map từ ({cfg.swipe_from.x}, {cfg.swipe_from.y}) đến ({cfg.swipe_to.x}, {cfg.swipe_to.y})...", "NAV")
        await input_dispatcher.swipe(serial, cfg.swipe_from.x, cfg.swipe_from.y, cfg.swipe_to.x, cfg.swipe_to.y, duration_ms=450)
        await asyncio.sleep(0.8)

    # 5. Nhấn vào vùng tuyết an toàn cuối map
    snow_x = cfg.snow_tap.x if cfg.snow_tap.x > 0 else 360
    snow_y = cfg.snow_tap.y if cfg.snow_tap.y > 0 else 1150
    log_manager.log("INFO", f"Nhấn vào vùng tuyết cuối map ({snow_x}, {snow_y}) để hoàn tất bỏ chọn an toàn", "NAV")
    await safe_tap(serial, snow_x, snow_y, delay_after=0.8, label="Chạm vùng tuyết cuối map")

    log_manager.log("INFO", "✅ Đã trở về và dọn sạch popup thành công!", "NAV")
    return True

async def execute_camera_reset(serial: str, custom_cfg=None) -> bool:
    """
    Quy trình 3 bước căn lại góc nhìn bản đồ về chính giữa trung tâm thành trì:
    - Bước 1: Nhấn ở ngoài map 1 cái (gọi quy trình Trở Về & Đóng Popup & Kéo xuống vùng tuyết).
    - Bước 2: Nhấn vào nút Xuất Thành (ưu tiên tìm theo ảnh mẫu ở góc phải app).
    - Bước 3: Nhấn vào nút Vào Thành (ưu tiên tìm theo ảnh mẫu ở góc phải app).
    """
    from app.core.auto_config import load_config
    if custom_cfg is not None:
        cfg = custom_cfg
    else:
        loaded = load_config()
        cfg = loaded.camera_reset

    log_manager.log("INFO", "🎯 Đang bắt đầu căn lại góc nhìn bản đồ về trung tâm...", "CAMERA")

    # BƯỚC 1: Thực hiện Trở Về, đóng popup & kéo xuống vùng tuyết nhấn 1 cái an toàn
    log_manager.log("INFO", "Bước 1/3: Xử lý Trở Về, đóng popup và kéo xuống vùng tuyết để nhấn an toàn...", "CAMERA")
    await execute_back_navigation(serial)

    # BƯỚC 2: Nhấn vào Xuất Thành (góc phải)
    log_manager.log("INFO", f"Bước 2/3: Đang tìm nút Xuất Thành ({cfg.step2_xuat_thanh_template})...", "CAMERA")
    found_xt, xt_x, xt_y, conf_xt = find_button_by_template(
        serial,
        cfg.step2_xuat_thanh_template,
        threshold=0.70
    )
    if found_xt:
        log_manager.log("INFO", f"Đã tìm thấy nút Xuất Thành (độ khớp {conf_xt:.2f}) tại ({xt_x}, {xt_y})", "CAMERA")
        await safe_tap(serial, xt_x, xt_y, delay_after=2.5, label="B2: Xuất Thành (Ảnh)")
    else:
        fb_xt_x = cfg.step2_xuat_thanh_btn.x if cfg.step2_xuat_thanh_btn.x > 0 else 650
        fb_xt_y = cfg.step2_xuat_thanh_btn.y if cfg.step2_xuat_thanh_btn.y > 0 else 1200
        log_manager.log("WARN", f"Không nhận diện được ảnh Xuất Thành (khớp {conf_xt:.2f}), bấm theo tọa độ ({fb_xt_x}, {fb_xt_y})", "CAMERA")
        await safe_tap(serial, fb_xt_x, fb_xt_y, delay_after=2.5, label="B2: Xuất Thành (Tọa độ)")

    # BƯỚC 3: Nhấn vào Vào Thành (góc phải)
    log_manager.log("INFO", f"Bước 3/3: Đang tìm nút Vào Thành ({cfg.step3_vao_thanh_template})...", "CAMERA")
    found_vt, vt_x, vt_y, conf_vt = find_button_by_template(
        serial,
        cfg.step3_vao_thanh_template,
        threshold=0.70
    )
    if found_vt:
        log_manager.log("INFO", f"Đã tìm thấy nút Vào Thành (độ khớp {conf_vt:.2f}) tại ({vt_x}, {vt_y})", "CAMERA")
        await safe_tap(serial, vt_x, vt_y, delay_after=2.5, label="B3: Vào Thành (Ảnh)")
    else:
        fb_vt_x = cfg.step3_vao_thanh_btn.x if cfg.step3_vao_thanh_btn.x > 0 else 650
        fb_vt_y = cfg.step3_vao_thanh_btn.y if cfg.step3_vao_thanh_btn.y > 0 else 1200
        log_manager.log("WARN", f"Không nhận diện được ảnh Vào Thành (khớp {conf_vt:.2f}), bấm theo tọa độ ({fb_vt_x}, {fb_vt_y})", "CAMERA")
        await safe_tap(serial, fb_vt_x, fb_vt_y, delay_after=2.5, label="B3: Vào Thành (Tọa độ)")

    log_manager.log("INFO", "✅ Bản đồ thành trì đã được căn về chính giữa trung tâm thành công!", "CAMERA")
    return True

