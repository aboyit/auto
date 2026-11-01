"""Services: DeviceManager, InputDispatcher (Single Queue with Lock), FrameService."""

import asyncio
import time
import uuid
from collections.abc import Callable
from typing import Literal
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

    async def swipe_sequence(
        self,
        serial: str,
        directions: list[tuple[Literal["up", "down", "left", "right"], int]],
        distance_ratio: float,
        duration_ms: int,
        should_stop: Callable[[], bool],
    ) -> bool:
        """Keep the entire ordered sequence under the device's single input lock."""
        async with self._get_lock(serial):
            if should_stop():
                return False
            loop = asyncio.get_running_loop()
            image = await loop.run_in_executor(None, self.client.screencap, serial)
            if should_stop():
                return False
            height, width = image.shape[:2]
            if width < 2 or height < 2:
                raise StudioError(ErrorCode.INVALID_COORDINATES, "Kich thuoc anh man hinh khong hop le")
            # A common pixel length, constrained by the shorter dimension, stays equally short in all directions.
            distance = max(1, round(min(width, height) * distance_ratio))
            cx, cy = width // 2, height // 2
            if not (0 < distance_ratio <= 0.25 and 50 <= duration_ms <= 5000 and
                    0 < len(directions) <= 4 and sum(count for _, count in directions) <= 100 and
                    len({direction for direction, _ in directions}) == len(directions) and
                    all(1 <= count <= 100 and direction in ("up", "down", "left", "right")
                        for direction, count in directions)):
                raise StudioError(ErrorCode.INVALID_COORDINATES, "Tham so vuot khong hop le")
            if not (0 <= cx - distance <= cx + distance < width and
                    0 <= cy - distance <= cy + distance < height):
                raise StudioError(ErrorCode.INVALID_COORDINATES, "Anh man hinh qua nho de vuot")
            offsets = {"up": (0, -distance), "down": (0, distance),
                       "left": (-distance, 0), "right": (distance, 0)}
            for direction, count in directions:
                dx, dy = offsets[direction]
                for _ in range(count):
                    if should_stop():
                        return False
                    success = await loop.run_in_executor(
                        None, self.client.swipe, serial, cx, cy, cx + dx, cy + dy, duration_ms
                    )
                    if not success:
                        return False
            return not should_stop()

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
