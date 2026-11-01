"""Data models va luu tru cho Macro / Scenarios (Kich ban kieu n8n)."""

import json
import logging
import uuid
from pathlib import Path
from typing import Literal
from pydantic import BaseModel, Field, model_validator

from app.core.config import DATA_DIR
from app.core.auto_config import Point

SCENARIOS_FILE = DATA_DIR / "scenarios.json"

SwipeDirection = Literal["up", "down", "left", "right"]


class DirectionalSwipe(BaseModel):
    direction: SwipeDirection
    count: int = Field(ge=0, le=100)


ActionType = Literal[
    "tap",            # Nhan toa do (x, y)
    "template_tap",   # Tim anh nhan dien va nhan vao tam
    "if_template",    # Kiem tra co anh hay khong (Dieu kien If/Else), re nhanh True/False
    "click_matched",  # Nhan vao toa do anh vua tim thay tu buoc If/Else
    "key_back",       # Bam phim Tro Ve Android (Back / ESC)
    "swipe",          # Vuot keo man hinh (x1, y1 -> x2, y2)
    "delay",          # Nghi cho doi (giay)
    "run_scenario",   # Goi kich ban con
    "finish",         # Ket thuc kich ban (Thanh cong hoac That bai, dung moi vong lap)
    "loop",           # Tuong thich nguoc
]

class ScenarioStep(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    type: ActionType = "tap"
    name: str = "Bước hành động"
    enabled: bool = True

    # Cai dat lap lai ap dung cho moi hanh dong:
    repeat_count: int = 1        # So lan thuc hien lap lai hanh dong nay (>= 1)
    repeat_delay: float = 0.5    # Khoang nghi giua cac lan lap (giay)

    # Toa do vi tri keo tha tren n8n canvas (Pixel X, Y):
    node_x: int | None = None
    node_y: int | None = None

    # Tham so cho 'tap':
    point: Point = Field(default_factory=lambda: Point(x=0, y=0))
    delay_after: float = 1.0

    # Tham so cho 'template_tap':
    template_name: str = ""
    templates: list[str] = Field(default_factory=list)
    threshold: float = 0.72
    # Region: [x1, y1, x2, y2] ti le tu 0.0 -> 1.0 (None nghia la toan man hinh)
    region: list[float] | None = None
    fallback_point: Point = Field(default_factory=lambda: Point(x=0, y=0))

    # Tham so cho 'click_matched' (Nhan vao anh da tim thay tu buoc If/Else):
    target_match_step_id: str = ""

    # Tham so cho 'swipe':
    swipe_from: Point = Field(default_factory=lambda: Point(x=360, y=400))
    swipe_to: Point = Field(default_factory=lambda: Point(x=360, y=900))
    duration_ms: int = Field(default=400, ge=50, le=5000)
    # When set, execute these directions in order instead of the legacy coordinate swipe.
    swipe_directions: list[DirectionalSwipe] = Field(default_factory=list, max_length=4)
    swipe_distance_ratio: float = Field(default=0.12, gt=0, le=0.25)

    @model_validator(mode="after")
    def validate_swipe_directions(self) -> "ScenarioStep":
        directions = [item.direction for item in self.swipe_directions]
        if len(directions) != len(set(directions)):
            raise ValueError("Each swipe direction may appear only once")
        if sum(item.count for item in self.swipe_directions) > 100:
            raise ValueError("Total directional swipes must not exceed 100")
        return self

    # Tham so cho 'delay':
    delay_seconds: float = 2.0

    # Tham so cho 'run_scenario':
    target_scenario_id: str = ""

    # Tham so cho 'finish':
    finish_status: str = "success"  # "success" (Thanh cong) | "fail" (That bai)

    # Tham so cho 'loop' (Vong lap):
    loop_mode: str = "count"  # "count" (lap lai X lan) hoac "while_template_found"
    loop_count: int = 5       # So lan lap lai hanh dong
    max_iterations: int = 10
    delay_between: float = 0.8
    loop_target_step_id: str = ""  # ID buoc lien ket vong lap


class ScenarioConnection(BaseModel):
    from_id: str
    to_id: str
    branch: str = "default"  # "default" | "true" | "false"


class Scenario(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str = "Kịch bản mới"
    description: str = ""
    enabled: bool = True
    interval_minutes: int = 0  # 0 = once per engine session, > 0 = periodic interval in minutes
    last_run_time: float = 0.0

    # Lap lai toan bo quy trinh cac buoc trong kich ban (A -> B -> A -> B):
    loop_count: int = 1        # So vong lap lai toan bo chuoi hanh dong cua kich ban
    loop_delay: float = 0.5    # Nghi giua cac vong lap (giay)

    steps: list[ScenarioStep] = Field(default_factory=list)
    start_step_id: str = ""
    connections: list[ScenarioConnection] = Field(default_factory=list)


class ScenarioList(BaseModel):
    scenarios: list[Scenario] = Field(default_factory=list)


def load_scenarios() -> list[Scenario]:
    if SCENARIOS_FILE.is_file():
        try:
            raw_text = SCENARIOS_FILE.read_text(encoding="utf-8")
            data = json.loads(raw_text)

            def _clean_step(st: dict) -> dict:
                if isinstance(st, dict) and st.get("type") == "back_nav":
                    st["type"] = "loop"
                    st["name"] = "Vòng lặp: Bấm Trở Về & Đóng X"
                    st["templates"] = ["btn_back.png", "btn_close_x.png"]
                    st["max_iterations"] = 10
                    st["delay_between"] = 0.8
                elif isinstance(st, dict) and st.get("type") == "reset_camera":
                    st["type"] = "run_scenario"
                    st["name"] = "Gọi kịch bản: Căn lại góc nhìn map"
                    st["target_scenario_id"] = "sc_camera_reset"
                return st

            if isinstance(data, list):
                for sc in data:
                    if isinstance(sc, dict) and "steps" in sc:
                        sc["steps"] = [_clean_step(st) for st in sc["steps"]]
                sc_list = [Scenario.model_validate(item) for item in data]
                save_scenarios(sc_list)
                return sc_list
            elif isinstance(data, dict) and "scenarios" in data:
                for sc in data["scenarios"]:
                    if isinstance(sc, dict) and "steps" in sc:
                        sc["steps"] = [_clean_step(st) for st in sc["steps"]]
                sc_list = [Scenario.model_validate(item) for item in data["scenarios"]]
                save_scenarios(sc_list)
                return sc_list
        except Exception as e:
            logging.error(f"Lỗi đọc scenarios.json: {e}")

    # Neu chua co kich ban, tra ve danh sach rong de nguoi dung tu tao moi
    return []


def save_scenarios(scenarios: list[Scenario]) -> None:
    try:
        data = [s.model_dump() for s in scenarios]
        SCENARIOS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        logging.error(f"Lỗi lưu scenarios.json: {e}")

