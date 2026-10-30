"""Module xu ly Auto Thu Thap Tai Nguyen (Gather)."""

from app.core.logger import log_manager
from app.core.auto_config import StudioAutoConfig
from app.services.auto_common import safe_tap

class GatherAuto:
    """Xu ly tu dong xuat quan thu thap."""

    def __init__(self):
        self.last_gather_time = 0

    def reset_timers(self):
        self.last_gather_time = 0

    async def run_cycle(self, serial: str, config: StudioAutoConfig, current_time: float):
        if not config.gather.enabled:
            return

        interval = config.gather.interval_minutes * 60
        if current_time - self.last_gather_time >= interval:
            self.last_gather_time = current_time
            await self.do_gather(serial, config)

    async def do_gather(self, serial: str, config: StudioAutoConfig):
        cfg = config.gather
        log_manager.log("INFO", f"Chạy chu trình Thu Thập ({cfg.squad_count} đội): Ra bản đồ thế giới ({cfg.world_map_btn.x}, {cfg.world_map_btn.y})", "GATHER")
        await safe_tap(serial, cfg.world_map_btn.x, cfg.world_map_btn.y, delay_after=2.0, label="Nút Thế Giới")
        await safe_tap(serial, cfg.search_res_btn.x, cfg.search_res_btn.y, delay_after=1.2, label="Kính lúp Tìm Tài Nguyên")
        await safe_tap(serial, cfg.dispatch_btn.x, cfg.dispatch_btn.y, delay_after=1.0, label="Nút Xuất Quân")

gather_auto = GatherAuto()
