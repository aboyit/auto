import json
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from app.core.config import DATA_DIR

CONFIG_FILE = DATA_DIR / "auto_config.json"

class Point(BaseModel):
    x: int = 0
    y: int = 0

class AllianceHelpConfig(BaseModel):
    enabled: bool = True
    interval_seconds: int = 15
    handshake_btn: Point = Field(default_factory=lambda: Point(x=430, y=875))
    help_all_btn: Point | None = None

class AllianceOpenConfig(BaseModel):
    enabled: bool = True
    open_btn: Point = Field(default_factory=lambda: Point(x=442, y=1216))

class AllianceGiftConfig(BaseModel):
    enabled: bool = False
    interval_minutes: int = 15
    step1_alliance_btn: Point = Field(default_factory=lambda: Point(x=0, y=0)) # Bước 1: Đồng minh
    step2_gift_btn: Point = Field(default_factory=lambda: Point(x=0, y=0))     # Bước 2: Nhấn vào quà tặng đồng minh
    step3_claim_btn: Point = Field(default_factory=lambda: Point(x=0, y=0))    # Bước 3: Nhận quà (nếu có)
    step4_back_btn1: Point = Field(default_factory=lambda: Point(x=0, y=0))    # Bước 4: Quay lại lần 1 (Mục Quà -> Sảnh)
    step5_back_btn2: Point = Field(default_factory=lambda: Point(x=0, y=0))    # Bước 5: Quay lại lần 2 (Sảnh -> Màn hình chính)

class CitizenGiftConfig(BaseModel):
    enabled: bool = False
    interval_seconds: int = 30
    gift_icon: Point = Field(default_factory=lambda: Point(x=360, y=95))
    claim_btn: Point = Field(default_factory=lambda: Point(x=360, y=850))

class TroopTrainConfig(BaseModel):
    enabled: bool = True
    step0_collect_btn: Point = Field(default_factory=lambda: Point(x=0, y=0)) # Bước 0 (Optional): Icon lính đã đào tạo
    step1_building_btn: Point = Field(default_factory=lambda: Point(x=0, y=0)) # Bước 1: Nhấn vào nhà lính
    step2_menu_btn: Point = Field(default_factory=lambda: Point(x=0, y=0))     # Bước 2: Chọn menu huấn luyện
    step3_train_btn: Point = Field(default_factory=lambda: Point(x=0, y=0))    # Bước 3: Chọn huấn luyện

class BarracksConfig(BaseModel):
    enabled: bool = True
    interval_minutes: int = 5
    # 3 loai quan rieng biet
    cavalry: TroopTrainConfig = Field(default_factory=TroopTrainConfig)   # Kỵ Binh
    infantry: TroopTrainConfig = Field(default_factory=TroopTrainConfig)  # Bộ Binh
    archers: TroopTrainConfig = Field(default_factory=TroopTrainConfig)   # Cung Thủ
    # Cac truong cu de tuong thich nguoc
    train_infantry: bool = True
    train_cavalry: bool = True
    train_archers: bool = True
    infantry_building: Point = Field(default_factory=lambda: Point(x=200, y=600))
    cavalry_building: Point = Field(default_factory=lambda: Point(x=350, y=600))
    archer_building: Point = Field(default_factory=lambda: Point(x=500, y=600))
    train_confirm_btn: Point = Field(default_factory=lambda: Point(x=550, y=1150))

class GatherResourceConfig(BaseModel):
    enabled: bool = True
    interval_minutes: int = 10
    squad_count: int = 3
    target_type: str = "auto"
    world_map_btn: Point = Field(default_factory=lambda: Point(x=650, y=1200))
    search_res_btn: Point = Field(default_factory=lambda: Point(x=100, y=1100))
    dispatch_btn: Point = Field(default_factory=lambda: Point(x=550, y=1150))

class CameraResetConfig(BaseModel):
    step1_outside_tap: Point = Field(default_factory=lambda: Point(x=360, y=300))
    step2_xuat_thanh_btn: Point = Field(default_factory=lambda: Point(x=650, y=1200))
    step2_xuat_thanh_template: str = "btn_xuat_thanh.png"
    step3_vao_thanh_btn: Point = Field(default_factory=lambda: Point(x=650, y=1200))
    step3_vao_thanh_template: str = "btn_vao_thanh.png"

class BackNavConfig(BaseModel):
    enabled: bool = True
    max_retries: int = 5
    # Nut Tro Ve goc trai (ho tro danh sach nhieu anh)
    back_btn: Point = Field(default_factory=lambda: Point(x=80, y=1240))
    back_template: str = "btn_back.png"
    back_templates: list[str] = Field(default_factory=lambda: ["btn_back.png"])
    # Nut X goc tren phai (ho tro danh sach nhieu anh)
    close_x_btn: Point = Field(default_factory=lambda: Point(x=660, y=200))
    close_x_template: str = "btn_close_x.png"
    close_x_templates: list[str] = Field(default_factory=lambda: ["btn_close_x.png"])
    # Cham vao popup 1 cai de dong
    popup_tap: Point = Field(default_factory=lambda: Point(x=360, y=250))
    # Vuot keo camera xuong cuoi map (vung tuyet)
    swipe_from: Point = Field(default_factory=lambda: Point(x=360, y=400))
    swipe_to: Point = Field(default_factory=lambda: Point(x=360, y=950))
    # Diem nhan vao vung tuyet cuoi map
    snow_tap: Point = Field(default_factory=lambda: Point(x=360, y=1150))
    snow_template: str = "snow_empty_area.png"

class StudioAutoConfig(BaseModel):
    is_running: bool = False
    camera_reset: CameraResetConfig = Field(default_factory=CameraResetConfig)
    back_nav: BackNavConfig = Field(default_factory=BackNavConfig)
    alliance_help: AllianceHelpConfig = Field(default_factory=AllianceHelpConfig)
    alliance_open: AllianceOpenConfig = Field(default_factory=AllianceOpenConfig)
    alliance_gift: AllianceGiftConfig = Field(default_factory=AllianceGiftConfig)
    citizen_gift: CitizenGiftConfig = Field(default_factory=CitizenGiftConfig)
    barracks: BarracksConfig = Field(default_factory=BarracksConfig)
    gather: GatherResourceConfig = Field(default_factory=GatherResourceConfig)

def load_config() -> StudioAutoConfig:
    if CONFIG_FILE.is_file():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            # Tự động di chuyển tọa độ alliance_icon cũ sang alliance_open.open_btn nếu có
            if "alliance_gift" in data and "alliance_icon" in data["alliance_gift"]:
                old_icon = data["alliance_gift"].pop("alliance_icon")
                if "alliance_open" not in data or not data["alliance_open"].get("open_btn", {}).get("x"):
                    data["alliance_open"] = {"enabled": True, "open_btn": old_icon}
            return StudioAutoConfig.model_validate(data)
        except Exception as e:
            logging.error(f"Loi doc file config: {e}")
    default_cfg = StudioAutoConfig()
    save_config(default_cfg)
    return default_cfg

def save_config(cfg: StudioAutoConfig) -> None:
    try:
        CONFIG_FILE.write_text(json.dumps(cfg.model_dump(), indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        logging.error(f"Loi luu file config: {e}")
