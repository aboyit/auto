"""FastAPI Main Application."""

import asyncio
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.websockets import WebSocketState

from app.core.config import settings
from app.core.errors import StudioError
from app.core.logger import log_manager
from app.api.devices import router as devices_router, frame_service
from app.api.auto import router as auto_router
from app.api.scenarios import router as scenarios_router

logger = logging.getLogger("studio")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Isometric Auto Game Studio API"
)

# CORS
cors_origins = list(settings.CORS_ORIGINS)
for dev_host in ("localhost", "127.0.0.1"):
    for dev_port in (5173, 4173):
        origin = f"http://{dev_host}:{dev_port}"
        if origin not in cors_origins:
            cors_origins.append(origin)
if settings.HOST in ("localhost", "127.0.0.1"):
    for dev_host in ("localhost", "127.0.0.1"):
        origin = f"http://{dev_host}:8000"
        if origin not in cors_origins:
            cors_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices_router)
app.include_router(auto_router)
app.include_router(scenarios_router)

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

@app.exception_handler(StudioError)
async def studio_error_handler(request, exc: StudioError):
    log_manager.log("ERROR", f"StudioError: {exc.message}", "API")
    return JSONResponse(
        status_code=400,
        content={"code": exc.code, "message": exc.message, "details": exc.details}
    )

@app.websocket("/ws/logs")
async def websocket_logs_stream(websocket: WebSocket):
    await websocket.accept()
    q = log_manager.subscribe()
    try:
        # Gui toan bo log cu truoc
        for item in log_manager.logs:
            await websocket.send_text(json.dumps(item))
            
        while True:
            item = await q.get()
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_text(json.dumps(item))
            else:
                break
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        log_manager.unsubscribe(q)
        if websocket.client_state == WebSocketState.CONNECTED:
            try:
                await websocket.close()
            except Exception:
                pass

@app.websocket("/ws/devices/{serial}/frames")
async def websocket_frame_stream(websocket: WebSocket, serial: str):
    await websocket.accept()
    try:
        while True:
            if websocket.client_state != WebSocketState.CONNECTED:
                break
                
            try:
                jpeg_bytes, meta = await frame_service.get_or_capture_frame(serial)
                
                if jpeg_bytes and meta and websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_bytes(jpeg_bytes)
                    await websocket.send_text(json.dumps(meta))
                
                # Stream muot toi da (nghi 0.04s ~ 25 FPS ly thuyet tuy thuoc thoi gian chup ADB)
                await asyncio.sleep(0.04)
            except (WebSocketDisconnect, RuntimeError):
                break
            except Exception as e:
                if websocket.client_state == WebSocketState.CONNECTED:
                    try:
                        await websocket.send_text(json.dumps({"error": str(e)}))
                    except Exception:
                        break
                await asyncio.sleep(0.5)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        if websocket.client_state == WebSocketState.CONNECTED:
            try:
                await websocket.close()
            except Exception:
                pass


# Phục vụ giao diện web tĩnh trực tiếp trên cổng 8000
frontend_dist = settings.FRONTEND_DIST
if frontend_dist.exists():
    from fastapi.staticfiles import StaticFiles
    from starlette.responses import FileResponse

    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.middleware("http")
    async def no_cache_middleware(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        target_file = frontend_dist / full_path
        if target_file.exists() and target_file.is_file():
            return FileResponse(str(target_file), headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"})
        return FileResponse(str(frontend_dist / "index.html"), headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"})
