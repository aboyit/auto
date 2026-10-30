"""Module xu ly Auto Nhan Qua (Citizen Gift)."""

from app.core.logger import log_manager
from app.core.auto_config import StudioAutoConfig
from app.services.auto_common import safe_tap, ensure_main_city_screen

class GiftAuto:
    """Xu ly tu dong nhan qua cu dan."""

    def __init__(self):
        self.last_gift_time = 0

    def reset_timers(self):
        self.last_gift_time = 0

    async def run_cycle(self, serial: str, config: StudioAutoConfig, current_time: float):
        if not config.citizen_gift.enabled:
            return

        interval = config.citizen_gift.interval_seconds
        if current_time - self.last_gift_time >= interval:
            self.last_gift_time = current_time
            await self.do_citizen_gift(serial, config)

    async def do_citizen_gift(self, serial: str, config: StudioAutoConfig):
        btn_icon = config.citizen_gift.gift_icon
        btn_claim = config.citizen_gift.claim_btn

        if btn_icon.x <= 0 or btn_icon.y <= 0:
            log_manager.log("WARN", "Chưa gán tọa độ Bước 1: Icon Hộp Quà (Thành)", "GIFT")
            return

        # Đảm bảo về màn hình chính trong thành trước khi nhận quà cư dân
        await ensure_main_city_screen(serial)

        log_manager.log("INFO", f"Bước 1: Nhấn Icon Hộp Quà Thành ({btn_icon.x}, {btn_icon.y})", "GIFT")
        await safe_tap(serial, btn_icon.x, btn_icon.y, delay_after=1.4, label="Bước 1: Icon Hộp Quà Thành")

        if btn_claim.x > 0 and btn_claim.y > 0:
            log_manager.log("INFO", f"Bước 2: Nhấn vào popup để nhận quà & ra màn hình chính ({btn_claim.x}, {btn_claim.y})", "GIFT")
            await safe_tap(serial, btn_claim.x, btn_claim.y, delay_after=1.0, label="Bước 2: Nhấn vào popup")
        else:
            # Neu chua gan toa do buoc 2, mac dinh cham vao giua man hinh de dong popup
            await safe_tap(serial, 360, 640, delay_after=1.0, label="Nhấn vào popup (Mặc định giữa màn hình)")

        log_manager.log("INFO", "Hoàn tất nhận quà cư dân", "GIFT")

gift_auto = GiftAuto()
