"""Runner dieu phoi cac chu trinh auto."""

import asyncio
import time

from app.core.auto_config import StudioAutoConfig, load_config, save_config
from app.core.logger import log_manager
from app.services.alliance_auto import alliance_auto
from app.services.gift_auto import gift_auto
from app.services.barracks_auto import barracks_auto
from app.services.gather_auto import gather_auto

class AutoRunner:
    """Dieu phoi tong the cac sub-module auto."""

    def __init__(self):
        self.config: StudioAutoConfig = load_config()
        self._task: asyncio.Task | None = None
        self.current_serial: str | None = None

    def start(self, serial: str):
        if self._task and not self._task.done():
            log_manager.log("WARN", "Chu trình tự động đang chạy!", "RUNNER")
            return
        self.current_serial = serial
        self.config.is_running = True

        # Reset moc thoi gian cua tat ca cac module con de chay ngay lap tuc
        alliance_auto.reset_timers()
        gift_auto.reset_timers()
        barracks_auto.reset_timers()
        gather_auto.reset_timers()

        save_config(self.config)
        self._task = asyncio.create_task(self._main_loop())
        log_manager.log("INFO", f"Khởi động hệ thống Auto Studio trên thiết bị {serial}", "RUNNER")

    def stop(self):
        self.config.is_running = False
        save_config(self.config)
        if self._task:
            self._task.cancel()
            self._task = None
        log_manager.log("WARN", "Đã dừng hệ thống Auto Studio", "RUNNER")

    def update_config(self, new_cfg: StudioAutoConfig):
        self.config = new_cfg
        save_config(self.config)
        log_manager.log("INFO", "Đã lưu cấu hình tọa độ & chu kỳ vào bộ nhớ", "CONFIG")

    async def _main_loop(self):
        log_manager.log("INFO", "Vòng lặp tự động đã bắt đầu hoạt động!", "RUNNER")
        while self.config.is_running and self.current_serial:
            now = time.time()
            try:
                # 1. Tab Dong Minh (Giup tat ca & Nhan qua dong minh)
                await alliance_auto.run_cycle(self.current_serial, self.config, now)

                # 2. Tab Nhan Qua (Cu dan)
                await gift_auto.run_cycle(self.current_serial, self.config, now)

                # 3. Tab Luyen Binh
                await barracks_auto.run_cycle(self.current_serial, self.config, now)

                # 4. Tab Thu Thap Tai Nguyen
                await gather_auto.run_cycle(self.current_serial, self.config, now)

            except asyncio.CancelledError:
                break
            except Exception as e:
                log_manager.log("ERROR", f"Lỗi trong chu trình Auto: {e}", "RUNNER")

            await asyncio.sleep(1.0)

    def save_help_icon_template(self, serial: str, x: int, y: int) -> bool:
        return alliance_auto.save_help_template(serial, x, y)

auto_runner = AutoRunner()

