"""Services: DeviceManager, InputDispatcher (Single Queue with Lock), FrameService."""

import asyncio
import time
import uuid
import cv2
import numpy as np
from pydantic import BaseModel

from app.adb.client import RealADBClient, FakeADBClient, ADBClientInterface
from app.core.errors import ErrorCode, StudioError

class DeviceInfo(BaseModel):
    serial: str
    state: str
    model: str
    connected: bool
    width: int = 720
    height: int = 1280

class DeviceManager:
    def __init__(self, client: ADBClientInterface | None = None):
        try:
            self.client = client or RealADBClient()
        except Exception:
            self.client = FakeADBClient()
        self._screen_sizes: dict[str, tuple[int, int]] = {}

    def get_devices(self) -> list[DeviceInfo]:
        raw_list = self.client.list_devices()
        results = []
        for d in raw_list:
            serial = d["serial"]
            w, h = self._screen_sizes.get(serial, (720, 1280))
            if d.get("connected") and serial not in self._screen_sizes:
                try:
                    w, h = self.client.get_screen_size(serial)
                    self._screen_sizes[serial] = (w, h)
                except Exception:
                    pass
            results.append(DeviceInfo(
                serial=serial,
                state=d["state"],
                model=d.get("model", "Unknown"),
                connected=d.get("connected", False),
                width=w,
                height=h
            ))
        return results

class InputDispatcher:
    """Quan ly single queue va execution lock cho tung device de chong trung lenh."""
    def __init__(self, client: ADBClientInterface):
        self.client = client
        self._locks: dict[str, asyncio.Lock] = {}

    def _get_lock(self, serial: str) -> asyncio.Lock:
        if serial not in self._locks:
            self._locks[serial] = asyncio.Lock()
        return self._locks[serial]

    async def tap(self, serial: str, x: int, y: int, max_w: int = 4000, max_h: int = 4000) -> bool:
        if x < 0 or y < 0 or x > max_w or y > max_h:
            raise StudioError(ErrorCode.INVALID_COORDINATES, f"Toa do khong hop le: ({x}, {y})")
        lock = self._get_lock(serial)
        async with lock:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, self.client.tap, serial, x, y)

    async def swipe(self, serial: str, x1: int, y1: int, x2: int, y2: int, duration_ms: int = 300) -> bool:
        lock = self._get_lock(serial)
        async with lock:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, self.client.swipe, serial, x1, y1, x2, y2, duration_ms)

    async def keyevent(self, serial: str, keycode: str | int) -> bool:
        lock = self._get_lock(serial)
        async with lock:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, self.client.keyevent, serial, keycode)

class FrameService:
    """Lay frame, ma hoa WebP/JPEG cho streaming va luu snapshot."""
    def __init__(self, client: ADBClientInterface):
        self.client = client
        self._lock: asyncio.Lock | None = None
        self._latest_jpeg: bytes | None = None
        self._latest_meta: dict | None = None

    def _get_lock(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    def capture_frame(self, serial: str) -> tuple[np.ndarray, dict]:
        img = self.client.screencap(serial)
        h, w = img.shape[:2]
        meta = {
            "frame_id": str(uuid.uuid4())[:8],
            "captured_at": time.time(),
            "width": w,
            "height": h,
            "serial": serial
        }
        return img, meta

    def encode_jpeg(self, img: np.ndarray, quality: int = 60, scale: float = 0.75) -> bytes:
        if scale < 1.0:
            new_w = int(img.shape[1] * scale)
            new_h = int(img.shape[0] * scale)
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        success, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality, cv2.IMWRITE_JPEG_OPTIMIZE, 0])
        if not success:
            raise StudioError(ErrorCode.SCREENSHOT_FAILED, "Ma hoa JPEG that bai")
        return buf.tobytes()

    async def get_or_capture_frame(self, serial: str) -> tuple[bytes | None, dict | None]:
        lock = self._get_lock()
        if lock.locked():
            return self._latest_jpeg, self._latest_meta

        async with lock:
            loop = asyncio.get_running_loop()
            try:
                img, meta = await loop.run_in_executor(None, self.capture_frame, serial)
                jpeg_bytes = await loop.run_in_executor(None, self.encode_jpeg, img, 65)
                self._latest_jpeg = jpeg_bytes
                self._latest_meta = meta
                return jpeg_bytes, meta
            except Exception:
                return self._latest_jpeg, self._latest_meta

# Tao singleton instances de export sang cac module khac dung chung
try:
    _default_adb_client = RealADBClient()
except Exception:
    _default_adb_client = FakeADBClient()

device_manager = DeviceManager(_default_adb_client)
input_dispatcher = InputDispatcher(_default_adb_client)
frame_service = FrameService(_default_adb_client)
