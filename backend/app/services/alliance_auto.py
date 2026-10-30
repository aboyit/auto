"""Module xu ly cac tinh nang Auto Dong Minh (Alliance)."""

import asyncio
import numpy as np
from app.core.logger import log_manager
from app.core.auto_config import StudioAutoConfig
from app.services.auto_common import safe_tap, is_template_visible, save_template_at_point, ensure_main_city_screen
from app.services.dispatcher import frame_service

class AllianceAuto:
    """Xu ly Giup Dong Minh, Mo Dong Minh va Nhan Qua Dong Minh (3 buoc)."""

    TEMPLATE_HELP_FILENAME = "alliance_help.png"

    def __init__(self):
        self.last_help_time = 0
        self.last_gift_time = 0

    def reset_timers(self):
        self.last_help_time = 0
        self.last_gift_time = 0

    async def run_cycle(self, serial: str, config: StudioAutoConfig, current_time: float):
        # 1. Giup tat ca dong minh
        if config.alliance_help.enabled:
            interval = config.alliance_help.interval_seconds
            if current_time - self.last_help_time >= interval:
                self.last_help_time = current_time
                await self.do_help_all(serial, config)

        # 2. Nhan qua dong minh (3 buoc)
        if config.alliance_gift.enabled:
            interval = config.alliance_gift.interval_minutes * 60
            if current_time - self.last_gift_time >= interval:
                self.last_gift_time = current_time
                await self.do_alliance_gift(serial, config)

    async def do_help_all(self, serial: str, config: StudioAutoConfig):
        btn = config.alliance_help.handshake_btn
        if btn.x <= 0 or btn.y <= 0:
            log_manager.log("WARN", "Chưa gán tọa độ Nút Giúp Tất Cả! Hãy dùng chức năng 'Gắn Vị Trí'", "HELP")
            return

        visible, confidence = is_template_visible(serial, btn.x, btn.y, self.TEMPLATE_HELP_FILENAME)
        if not visible:
            log_manager.log("DEBUG", f"Không thấy icon Giúp Tất Cả ({confidence:.2f}), bỏ qua để tránh mở khung chat", "HELP")
            return

        log_manager.log("INFO", f"Phát hiện icon Giúp Tất Cả ({confidence:.2f}), đang thực hiện nhấn...", "HELP")
        await safe_tap(serial, btn.x, btn.y, delay_after=0.5, label="Nút Giúp Tất Cả")

    def check_has_reward_popup(self, image: np.ndarray) -> bool:
        """Kiem tra xem co popup Nhan Thuong voi nen xanh lam dam ap dao hay khong."""
        if image is None or image.size == 0:
            return False
        h, w = image.shape[:2]
        sample = image[int(h * 0.5):int(h * 0.85), int(w * 0.2):int(w * 0.8)]
        if sample.size == 0:
            return False
        mean_blue = float(np.mean(sample[:, :, 0]))
        mean_red  = float(np.mean(sample[:, :, 2]))
        is_reward = (mean_blue > mean_red * 1.3) and (mean_blue > 40.0)
        return is_reward

    async def do_alliance_gift(self, serial: str, config: StudioAutoConfig):
        cfg = config.alliance_gift

        # Kiem tra cac toa do buoc co ban
        if cfg.step1_alliance_btn.x <= 0 or cfg.step2_gift_btn.x <= 0 or cfg.step3_claim_btn.x <= 0:
            log_manager.log("WARN", "Chưa gán đủ các bước Nhận Quà Đồng Minh! Hãy vào tab Đồng Minh để gán vị trí", "ALLIANCE_GIFT")
            return

        log_manager.log("INFO", "Bắt đầu chu trình Nhận Quà Đồng Minh (5 bước)", "ALLIANCE_GIFT")

        # Đảm bảo trở về màn hình chính trong thành trước khi thực hiện bước 1
        await ensure_main_city_screen(serial)

        # Buoc 1: Dong Minh
        log_manager.log("INFO", "Bước 1: Chọn Đồng Minh", "ALLIANCE_GIFT")
        await safe_tap(serial, cfg.step1_alliance_btn.x, cfg.step1_alliance_btn.y, delay_after=1.5, label="Bước 1: Đồng Minh")

        # Buoc 2: Nhan vao qua tang dong minh
        log_manager.log("INFO", "Bước 2: Nhấn vào Quà tặng Đồng Minh", "ALLIANCE_GIFT")
        await safe_tap(serial, cfg.step2_gift_btn.x, cfg.step2_gift_btn.y, delay_after=1.5, label="Bước 2: Quà tặng Đồng Minh")

        # Buoc 3: Nhan qua (neu co qua)
        if cfg.step3_claim_btn.x > 0 and cfg.step3_claim_btn.y > 0:
            log_manager.log("INFO", "Bước 3: Nhấn nút Nhận Quà", "ALLIANCE_GIFT")
            await safe_tap(serial, cfg.step3_claim_btn.x, cfg.step3_claim_btn.y, delay_after=1.4, label="Bước 3: Nút Nhận Quà")

            # Chup man hinh de phan biet: Co popup Nhan Thuong hay la Man hinh chua co qua
            image, _ = frame_service.capture_frame(serial)
            has_reward = self.check_has_reward_popup(image)

            if has_reward:
                log_manager.log("INFO", "🎁 Phát hiện popup Nhận Thưởng! Nhấn 1 lần để nhận quà và tự thoát ra màn hình chính", "ALLIANCE_GIFT")
                h, w = image.shape[:2]
                tap_x = w // 2
                tap_y = int(h * 0.75)
                await safe_tap(serial, tap_x, tap_y, delay_after=1.2, label="Đóng popup nhận thưởng (Ra màn hình chính)")
                log_manager.log("INFO", "Hoàn tất chu trình Nhận Quà Đồng Minh", "ALLIANCE_GIFT")
                return

            log_manager.log("INFO", "ℹ️ Chưa có quà tặng đồng minh! Nhấn nút Quay lại 2 lần để trở về màn hình chính", "ALLIANCE_GIFT")

        # Buoc 4: Nut Quay lai lan 1 (Khi khong co qua: Tu muc Qua ra Sanh Dong Minh)
        if cfg.step4_back_btn1.x > 0 and cfg.step4_back_btn1.y > 0:
            log_manager.log("INFO", "Bước 4: Quay lại lần 1 (Mục Quà ➔ Sảnh)", "ALLIANCE_GIFT")
            await safe_tap(serial, cfg.step4_back_btn1.x, cfg.step4_back_btn1.y, delay_after=1.2, label="Bước 4: Quay lại lần 1")

        # Buoc 5: Nut Quay lai lan 2 (Khi khong co qua: Tu Sanh Dong Minh ra Man hinh chinh)
        if cfg.step5_back_btn2.x > 0 and cfg.step5_back_btn2.y > 0:
            log_manager.log("INFO", "Bước 5: Quay lại lần 2 (Sảnh ➔ Màn hình chính)", "ALLIANCE_GIFT")
            await safe_tap(serial, cfg.step5_back_btn2.x, cfg.step5_back_btn2.y, delay_after=1.2, label="Bước 5: Quay lại lần 2")

        log_manager.log("INFO", "Hoàn tất chu trình Nhận Quà Đồng Minh", "ALLIANCE_GIFT")

    def save_help_template(self, serial: str, x: int, y: int) -> bool:
        return save_template_at_point(serial, x, y, self.TEMPLATE_HELP_FILENAME)

alliance_auto = AllianceAuto()
