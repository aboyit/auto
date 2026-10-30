"""Module xu ly Auto Luyen Binh (Barracks)."""

import asyncio
from app.core.logger import log_manager
from app.core.auto_config import StudioAutoConfig
from app.services.auto_common import safe_tap, ensure_main_city_screen, is_template_visible

class BarracksAuto:
    """Xu ly tu dong luyen 3 loai binh (Ky Binh, Bo Binh, Cung Thu)."""

    def __init__(self):
        self.last_train_time = 0

    def reset_timers(self):
        self.last_train_time = 0

    async def run_cycle(self, serial: str, config: StudioAutoConfig, current_time: float):
        if not config.barracks.enabled:
            return

        interval = config.barracks.interval_minutes * 60
        if current_time - self.last_train_time >= interval:
            self.last_train_time = current_time
            await self.do_train_troops(serial, config)

    async def do_train_troops(self, serial: str, config: StudioAutoConfig):
        cfg = config.barracks

        # 1. Xu ly Ky Binh (Uu tien)
        if cfg.cavalry and cfg.cavalry.enabled:
            await self.train_cavalry(serial, cfg)

        # 2. Xu ly Bo Binh
        if cfg.infantry and cfg.infantry.enabled and cfg.infantry.step1_building_btn.x > 0:
            await self.train_infantry(serial, cfg)

        # 3. Xu ly Cung Thu
        if cfg.archers and cfg.archers.enabled and cfg.archers.step1_building_btn.x > 0:
            await self.train_archers(serial, cfg)

    async def train_cavalry(self, serial: str, barracks_cfg):
        cav = barracks_cfg.cavalry
        if cav.step1_building_btn.x <= 0 or cav.step2_menu_btn.x <= 0 or cav.step3_train_btn.x <= 0:
            # Neu chua gan toa do ky binh
            log_manager.log("WARN", "Chưa gán đủ các bước cho Kỵ Binh! Hãy vào tab Luyện Binh để gán", "CAVALRY")
            return

        log_manager.log("INFO", "Bắt đầu chu trình Huấn luyện Kỵ Binh", "CAVALRY")
        await ensure_main_city_screen(serial)

        # B0 (Optional): Chon icon linh ky binh da dao tao neu co
        if cav.step0_collect_btn and cav.step0_collect_btn.x > 0 and cav.step0_collect_btn.y > 0:
            visible, conf = is_template_visible(serial, cav.step0_collect_btn.x, cav.step0_collect_btn.y, "cavalry_collect.png", threshold=0.74)
            if visible:
                log_manager.log("INFO", f"Phát hiện icon lính Kỵ Binh đã đào tạo xong ({conf:.2f}), đang thu nhận...", "CAVALRY")
                await safe_tap(serial, cav.step0_collect_btn.x, cav.step0_collect_btn.y, delay_after=1.2, label="B0: Thu nhận lính Kỵ Binh")
            else:
                log_manager.log("INFO", "Không phát hiện icon lính Kỵ Binh đã hoàn thành (bỏ qua B0)", "CAVALRY")

        # B1: Nhan vao nha ky binh
        log_manager.log("INFO", f"Bước 1: Nhấn vào nhà Kỵ Binh ({cav.step1_building_btn.x}, {cav.step1_building_btn.y})", "CAVALRY")
        await safe_tap(serial, cav.step1_building_btn.x, cav.step1_building_btn.y, delay_after=1.4, label="B1: Nhà Kỵ Binh")

        # B2: Chon menu huan luyen
        log_manager.log("INFO", f"Bước 2: Chọn menu Huấn Luyện ({cav.step2_menu_btn.x}, {cav.step2_menu_btn.y})", "CAVALRY")
        await safe_tap(serial, cav.step2_menu_btn.x, cav.step2_menu_btn.y, delay_after=1.5, label="B2: Menu Huấn Luyện")

        # B3: Chon huan luyen
        log_manager.log("INFO", f"Bước 3: Nhấn nút Huấn Luyện ({cav.step3_train_btn.x}, {cav.step3_train_btn.y})", "CAVALRY")
        await safe_tap(serial, cav.step3_train_btn.x, cav.step3_train_btn.y, delay_after=1.2, label="B3: Nút Huấn Luyện")

        # Tro ve man hinh chinh trong thanh sau khi huan luyen
        await ensure_main_city_screen(serial)
        log_manager.log("INFO", "Hoàn tất chu trình Huấn luyện Kỵ Binh", "CAVALRY")

    async def train_infantry(self, serial: str, barracks_cfg):
        inf = barracks_cfg.infantry
        if inf.step1_building_btn.x <= 0 or inf.step2_menu_btn.x <= 0 or inf.step3_train_btn.x <= 0:
            return
        log_manager.log("INFO", "Bắt đầu chu trình Huấn luyện Bộ Binh", "INFANTRY")
        await ensure_main_city_screen(serial)
        if inf.step0_collect_btn and inf.step0_collect_btn.x > 0:
            visible, _ = is_template_visible(serial, inf.step0_collect_btn.x, inf.step0_collect_btn.y, "infantry_collect.png", threshold=0.74)
            if visible:
                await safe_tap(serial, inf.step0_collect_btn.x, inf.step0_collect_btn.y, delay_after=1.2, label="B0: Thu nhận Bộ Binh")
        await safe_tap(serial, inf.step1_building_btn.x, inf.step1_building_btn.y, delay_after=1.4, label="B1: Nhà Bộ Binh")
        await safe_tap(serial, inf.step2_menu_btn.x, inf.step2_menu_btn.y, delay_after=1.5, label="B2: Menu Huấn Luyện")
        await safe_tap(serial, inf.step3_train_btn.x, inf.step3_train_btn.y, delay_after=1.2, label="B3: Nút Huấn Luyện")
        await ensure_main_city_screen(serial)
        log_manager.log("INFO", "Hoàn tất chu trình Huấn luyện Bộ Binh", "INFANTRY")

    async def train_archers(self, serial: str, barracks_cfg):
        arc = barracks_cfg.archers
        if arc.step1_building_btn.x <= 0 or arc.step2_menu_btn.x <= 0 or arc.step3_train_btn.x <= 0:
            return
        log_manager.log("INFO", "Bắt đầu chu trình Huấn luyện Cung Thủ", "ARCHERS")
        await ensure_main_city_screen(serial)
        if arc.step0_collect_btn and arc.step0_collect_btn.x > 0:
            visible, _ = is_template_visible(serial, arc.step0_collect_btn.x, arc.step0_collect_btn.y, "archers_collect.png", threshold=0.74)
            if visible:
                await safe_tap(serial, arc.step0_collect_btn.x, arc.step0_collect_btn.y, delay_after=1.2, label="B0: Thu nhận Cung Thủ")
        await safe_tap(serial, arc.step1_building_btn.x, arc.step1_building_btn.y, delay_after=1.4, label="B1: Nhà Cung Thủ")
        await safe_tap(serial, arc.step2_menu_btn.x, arc.step2_menu_btn.y, delay_after=1.5, label="B2: Menu Huấn Luyện")
        await safe_tap(serial, arc.step3_train_btn.x, arc.step3_train_btn.y, delay_after=1.2, label="B3: Nút Huấn Luyện")
        await ensure_main_city_screen(serial)
        log_manager.log("INFO", "Hoàn tất chu trình Huấn luyện Cung Thủ", "ARCHERS")

barracks_auto = BarracksAuto()
