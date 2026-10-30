"""API router cho Auto configuration va Logs."""

import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from app.core.config import TEMPLATES_DIR
from app.core.auto_config import StudioAutoConfig, load_config, save_config
from app.core.logger import log_manager
from app.services.auto_runner import auto_runner

router = APIRouter(prefix="/api/auto", tags=["auto"])

class ControlAction(BaseModel):
    serial: str
    action: str # "start" hoac "stop"

@router.get("/config")
async def get_auto_config():
    return auto_runner.config

@router.post("/config")
async def update_auto_config(cfg: StudioAutoConfig):
    auto_runner.update_config(cfg)
    return {"status": "ok", "config": auto_runner.config}

@router.post("/control")
async def control_auto(payload: ControlAction):
    if payload.action == "start":
        auto_runner.start(payload.serial)
        return {"status": "running"}
    elif payload.action == "stop":
        auto_runner.stop()
        return {"status": "stopped"}
    raise HTTPException(status_code=400, detail="Hành động không hợp lệ")

@router.get("/logs")
async def get_logs():
    return log_manager.logs

@router.post("/logs/clear")
async def clear_logs():
    log_manager.clear()
    return {"status": "cleared"}


class HelpTemplateRequest(BaseModel):
    serial: str
    x: int
    y: int


@router.post("/help/template")
async def save_help_template(payload: HelpTemplateRequest):
    loop = asyncio.get_running_loop()
    saved = await loop.run_in_executor(None, auto_runner.save_help_icon_template, payload.serial, payload.x, payload.y)
    if not saved:
        raise HTTPException(status_code=400, detail="Không thể lưu mẫu icon Giúp Tất Cả")
    return {"status": "saved"}


class StepPoint(BaseModel):
    x: int
    y: int
    name: str = ""


class NavigateStepsRequest(BaseModel):
    serial: str
    steps: list[StepPoint]
    delay_seconds: float = 1.4


@router.post("/navigate-steps")
async def navigate_steps(payload: NavigateStepsRequest):
    if not payload.serial:
        raise HTTPException(status_code=400, detail="Thiếu mã serial thiết bị")
    from app.services.auto_common import safe_tap, ensure_main_city_screen

    # Đảm bảo về màn hình chính trong thành trước khi thực thi chuỗi bước điều hướng
    await ensure_main_city_screen(payload.serial)

    log_manager.log("INFO", f"Bắt đầu điều hướng {len(payload.steps)} bước để mở giao diện...", "NAV")
    for i, step in enumerate(payload.steps):
        if step.x > 0 and step.y > 0:
            step_name = step.name if step.name else f"Bước {i + 1}"
            log_manager.log("INFO", f"👉 [Điều hướng {i+1}/{len(payload.steps)}] Nhấn {step_name} tại ({step.x}, {step.y})", "NAV")
            await safe_tap(
                payload.serial,
                step.x,
                step.y,
                delay_after=payload.delay_seconds,
                label=f"[Điều hướng] {step_name}"
            )
    log_manager.log("INFO", "Đã hoàn thành các bước điều hướng, sẵn sàng để gán vị trí", "NAV")
    return {"status": "ok"}


class TestClickRequest(BaseModel):
    serial: str
    x: int
    y: int
    label: str = "Thử nghiệm"


@router.post("/test-click")
async def test_click_point(payload: TestClickRequest):
    if not payload.serial:
        raise HTTPException(status_code=400, detail="Thiếu mã serial thiết bị")
    from app.services.auto_common import safe_tap
    log_manager.log("INFO", f"🧪 Bấm thử '{payload.label}' tại tọa độ ({payload.x}, {payload.y})", "TEST")
    await safe_tap(payload.serial, payload.x, payload.y, delay_after=1.0, label=f"Bấm thử {payload.label}")
    return {"status": "ok"}


class ResetCameraRequest(BaseModel):
    serial: str


@router.post("/reset-camera")
async def reset_city_camera(payload: ResetCameraRequest):
    if not payload.serial:
        raise HTTPException(status_code=400, detail="Thiếu mã serial thiết bị")
    from app.services.auto_common import execute_camera_reset
    log_manager.log("INFO", f"🎯 [Căn Lại Camera] Bắt đầu quy trình trên {payload.serial}...", "CAMERA")
    success = await execute_camera_reset(payload.serial)
    if success:
        log_manager.log("INFO", f"✔ [Căn Lại Camera] Hoàn tất căn góc nhìn bản đồ thành công!", "CAMERA")
    else:
        log_manager.log("WARN", f"❌ [Căn Lại Camera] Căn góc nhìn bản đồ thất bại!", "CAMERA")
    return {"status": "ok", "success": success}


class TemplateSaveRequest(BaseModel):
    serial: str
    x: int = 0
    y: int = 0
    template_name: str
    radius: int = 35
    x1: int | None = None
    y1: int | None = None
    x2: int | None = None
    y2: int | None = None


@router.post("/template/save")
async def save_custom_template(payload: TemplateSaveRequest):
    loop = asyncio.get_running_loop()
    if payload.x1 is not None and payload.x2 is not None and payload.y1 is not None and payload.y2 is not None:
        from app.services.auto_common import save_template_crop_box
        saved = await loop.run_in_executor(
            None,
            save_template_crop_box,
            payload.serial,
            payload.x1,
            payload.y1,
            payload.x2,
            payload.y2,
            payload.template_name,
        )
    else:
        from app.services.auto_common import save_template_at_point
        saved = await loop.run_in_executor(
            None,
            save_template_at_point,
            payload.serial,
            payload.x,
            payload.y,
            payload.template_name,
            payload.radius,
        )
    if not saved:
        raise HTTPException(status_code=400, detail="Không thể lưu mẫu ảnh nhận diện")
    return {"status": "saved"}


@router.get("/template/list")
async def list_templates():
    items = []
    if TEMPLATES_DIR.is_dir():
        for f in TEMPLATES_DIR.glob("*.png"):
            items.append({
                "name": f.name,
                "size": f.stat().st_size,
                "modified": int(f.stat().st_mtime)
            })
    return sorted(items, key=lambda x: x["name"])


class TemplateUploadPayload(BaseModel):
    filename: str
    base64_data: str


@router.post("/template/upload")
async def upload_template(payload: TemplateUploadPayload):
    import base64
    if not payload.filename:
        raise HTTPException(status_code=400, detail="Thiếu tên tệp")
    target_name = Path(payload.filename).name
    # Tách header data:image/png;base64, neu co
    raw_b64 = payload.base64_data
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]
    try:
        content = base64.b64decode(raw_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Dữ liệu base64 không hợp lệ")
    save_path = TEMPLATES_DIR / target_name
    save_path.write_bytes(content)
    log_manager.log("INFO", f"Đã nạp ảnh mẫu nhận diện: {target_name}", "VISION")
    return {"status": "uploaded", "name": target_name, "size": len(content)}



@router.get("/template/info/{template_name}")
async def get_template_info(template_name: str):
    file_path = TEMPLATES_DIR / template_name
    exists = file_path.is_file()
    size = file_path.stat().st_size if exists else 0
    return {"name": template_name, "exists": exists, "size": size}


@router.get("/template/image/{template_name}")
async def get_template_image(template_name: str):
    from starlette.responses import FileResponse
    file_path = TEMPLATES_DIR / template_name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Ảnh mẫu không tồn tại")
    return FileResponse(str(file_path), media_type="image/png")


@router.delete("/template/{template_name}")
async def delete_template(template_name: str):
    file_path = TEMPLATES_DIR / template_name
    if file_path.is_file():
        file_path.unlink()
        log_manager.log("INFO", f"Đã xóa ảnh mẫu '{template_name}' khỏi thư viện", "VISION")
        return {"status": "deleted", "name": template_name}
    raise HTTPException(status_code=404, detail="Không tìm thấy tệp ảnh")


class TemplateTestFindRequest(BaseModel):
    serial: str
    template_name: str
    threshold: float = 0.70


@router.post("/template/test-find")
async def test_find_template(payload: TemplateTestFindRequest):
    loop = asyncio.get_running_loop()
    from app.services.auto_common import find_button_by_template
    found, cx, cy, conf = await loop.run_in_executor(
        None,
        find_button_by_template,
        payload.serial,
        payload.template_name,
        payload.threshold
    )
    return {
        "found": found,
        "x": cx,
        "y": cy,
        "confidence": round(conf, 3),
        "threshold": payload.threshold
    }


class BackNavExecuteRequest(BaseModel):
    serial: str


@router.post("/back-nav/execute")
async def run_back_navigation(payload: BackNavExecuteRequest):
    if not payload.serial:
        raise HTTPException(status_code=400, detail="Thiếu mã serial thiết bị")
    from app.services.auto_common import execute_back_navigation
    success = await execute_back_navigation(payload.serial)
    return {"status": "ok", "success": success}



