"""Devices and Control REST API."""

import asyncio
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from app.services.dispatcher import device_manager, input_dispatcher, frame_service
from app.core.logger import log_manager
from app.core.errors import StudioError

router = APIRouter(prefix="/api/devices", tags=["devices"])

class TapRequest(BaseModel):
    x: int = Field(..., description="Device X coordinate")
    y: int = Field(..., description="Device Y coordinate")

class SwipeRequest(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int
    duration_ms: int = Field(300, ge=50, le=5000)

class KeyEventRequest(BaseModel):
    keycode: str | int

@router.get("")
async def list_devices():
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, device_manager.get_devices)

@router.get("/{serial}/frame")
def get_snapshot(serial: str):
    try:
        img, meta = frame_service.capture_frame(serial)
        jpeg_bytes = frame_service.encode_jpeg(img, quality=85, scale=1.0)
        return Response(content=jpeg_bytes, media_type="image/jpeg", headers={
            "X-Frame-Id": meta["frame_id"],
            "X-Width": str(meta["width"]),
            "X-Height": str(meta["height"])
        })
    except StudioError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{serial}/tap")
async def send_tap(serial: str, req: TapRequest):
    try:
        log_manager.log("INFO", f"🖱️ [Click Preview] Nhấn tại ({req.x}, {req.y}) trên {serial}", "PREVIEW")
        success = await input_dispatcher.tap(serial, req.x, req.y)
        if success:
            log_manager.log("INFO", f"✔ [Preview Tap OK] Nhấn ({req.x}, {req.y}) thành công", "PREVIEW")
        else:
            log_manager.log("WARN", f"❌ [Preview Tap FAILED] Nhấn ({req.x}, {req.y}) thất bại", "PREVIEW")
        return {"success": success, "x": req.x, "y": req.y}
    except StudioError as e:
        log_manager.log("ERROR", f"❌ [Preview Tap Lỗi] {e.message}", "PREVIEW")
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})

@router.post("/{serial}/swipe")
async def send_swipe(serial: str, req: SwipeRequest):
    try:
        log_manager.log("INFO", f"👉 [Swipe Preview] Vuốt từ ({req.x1}, {req.y1}) đến ({req.x2}, {req.y2}) ({req.duration_ms}ms) trên {serial}", "PREVIEW")
        success = await input_dispatcher.swipe(serial, req.x1, req.y1, req.x2, req.y2, req.duration_ms)
        if success:
            log_manager.log("INFO", f"✔ [Preview Swipe OK] Vuốt màn hình thành công", "PREVIEW")
        else:
            log_manager.log("WARN", f"❌ [Preview Swipe FAILED] Vuốt màn hình thất bại", "PREVIEW")
        return {"success": success}
    except StudioError as e:
        log_manager.log("ERROR", f"❌ [Preview Swipe Lỗi] {e.message}", "PREVIEW")
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})

@router.post("/{serial}/keyevent")
async def send_keyevent(serial: str, req: KeyEventRequest):
    try:
        log_manager.log("INFO", f"⌨️ [Keyevent] Bấm phím keycode {req.keycode} trên {serial}", "PREVIEW")
        success = await input_dispatcher.keyevent(serial, req.keycode)
        if success:
            log_manager.log("INFO", f"✔ [Keyevent OK] Bấm phím {req.keycode} thành công", "PREVIEW")
        return {"success": success}
    except StudioError as e:
        log_manager.log("ERROR", f"❌ [Keyevent Lỗi] {e.message}", "PREVIEW")
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})

@router.post("/launch-game")
async def launch_game_auto():
    return await _launch_game()


@router.post("/{serial}/launch-game")
async def launch_game(serial: str):
    return await _launch_game(serial)


async def _launch_game(serial: str | None = None):
    from app.services.game_launcher import launch_game as start_game

    try:
        return await start_game(serial)
    except Exception as exc:
        log_manager.log("ERROR", f"Game launch failed: {exc}", "SYSTEM")
        raise HTTPException(status_code=503, detail={"code": "GAME_LAUNCH_FAILED", "message": str(exc)}) from exc
