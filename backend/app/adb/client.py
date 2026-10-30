"""ADB Client abstraction with support for real ADB and FakeADB."""

import os
import shutil
import subprocess
from pathlib import Path
from typing import Protocol
import cv2
import numpy as np

from app.core.config import settings
from app.core.errors import ErrorCode, StudioError

class ADBClientInterface(Protocol):
    def list_devices(self) -> list[dict]: ...
    def screencap(self, serial: str) -> np.ndarray: ...
    def tap(self, serial: str, x: int, y: int) -> bool: ...
    def swipe(self, serial: str, x1: int, y1: int, x2: int, y2: int, duration_ms: int) -> bool: ...
    def keyevent(self, serial: str, keycode: str | int) -> bool: ...
    def get_screen_size(self, serial: str) -> tuple[int, int]: ...
    def launch_app(self, serial: str, package_name: str, activity_name: str | None = None) -> bool: ...

def find_adb_binary() -> str:
    # 1. Thu muc platform-tools du an
    local_adb = Path(settings.DEFAULT_ADB_PATH)
    if local_adb.is_file():
        return str(local_adb)
    
    # 2. PATH he thong
    which_adb = shutil.which("adb")
    if which_adb:
        return which_adb
        
    # 3. Thu muc WinGet
    winget_adb = (
        Path.home()
        / "AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb.exe"
    )
    if winget_adb.is_file():
        return str(winget_adb)
        
    raise StudioError(ErrorCode.ADB_NOT_FOUND, "Khong tim thay tap tin adb.exe")

class RealADBClient:
    def __init__(self, adb_path: str | None = None):
        self.adb_path = adb_path or find_adb_binary()

    def _run_cmd(self, args: list[str], timeout: float = 10.0) -> subprocess.CompletedProcess:
        cmd = [self.adb_path] + args
        try:
            return subprocess.run(
                cmd,
                capture_output=True,
                check=False,
                timeout=timeout
            )
        except subprocess.TimeoutExpired:
            raise StudioError(ErrorCode.INPUT_FAILED, f"Lenh ADB qua thoi gian cho ({timeout}s): {' '.join(cmd)}")
        except Exception as e:
            raise StudioError(ErrorCode.UNKNOWN_ERROR, f"Loi thuc thi ADB: {e}")

    def list_devices(self) -> list[dict]:
        proc = self._run_cmd(["devices", "-l"])
        output = proc.stdout.decode("utf-8", errors="ignore")
        devices = []
        for line in output.strip().splitlines()[1:]:
            parts = line.split()
            if len(parts) >= 2:
                serial, state = parts[0], parts[1]
                model = "Unknown"
                for p in parts[2:]:
                    if p.startswith("model:"):
                        model = p.split(":", 1)[1]
                devices.append({
                    "serial": serial,
                    "state": state,
                    "model": model,
                    "connected": state == "device"
                })
        return devices

    def screencap(self, serial: str) -> np.ndarray:
        cmd = [self.adb_path, "-s", serial, "exec-out", "screencap", "-p"]
        try:
            proc = subprocess.run(cmd, capture_output=True, timeout=8.0)
            if proc.returncode != 0 or not proc.stdout:
                raise StudioError(ErrorCode.SCREENSHOT_FAILED, f"Chup anh that bai: {proc.stderr.decode()}")
            
            # Decode raw PNG bytes to OpenCV image (BGR)
            image_array = np.frombuffer(proc.stdout, dtype=np.uint8)
            img = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            if img is None:
                raise StudioError(ErrorCode.SCREENSHOT_FAILED, "Giai ma bytes anh screencap that bai")
            return img
        except subprocess.TimeoutExpired:
            raise StudioError(ErrorCode.SCREENSHOT_FAILED, "Timeout chup man hinh qua ADB")

    def tap(self, serial: str, x: int, y: int) -> bool:
        proc = self._run_cmd(["-s", serial, "shell", "input", "tap", str(x), str(y)])
        return proc.returncode == 0

    def swipe(self, serial: str, x1: int, y1: int, x2: int, y2: int, duration_ms: int = 300) -> bool:
        proc = self._run_cmd(["-s", serial, "shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(duration_ms)])
        return proc.returncode == 0

    def keyevent(self, serial: str, keycode: str | int) -> bool:
        proc = self._run_cmd(["-s", serial, "shell", "input", "keyevent", str(keycode)])
        return proc.returncode == 0

    def get_screen_size(self, serial: str) -> tuple[int, int]:
        proc = self._run_cmd(["-s", serial, "shell", "wm", "size"])
        output = proc.stdout.decode("utf-8", errors="ignore")
        # Format: Physical size: 720x1280
        for line in output.splitlines():
            if "size:" in line:
                size_part = line.split(":")[-1].strip()
                if "x" in size_part:
                    w, h = size_part.split("x")
                    return int(w), int(h)
        return (720, 1280)

    def launch_app(self, serial: str, package_name: str, activity_name: str | None = None) -> bool:
        """Khoi dong game bang monkey va am start."""
        # 1. Thu am start truc tiep neu co activity
        if activity_name:
            proc_am = self._run_cmd(["-s", serial, "shell", "am", "start", "-n", f"{package_name}/{activity_name}"])
            if proc_am.returncode == 0:
                return True
        # 2. Thu dung monkey launcher
        proc_monkey = self._run_cmd(["-s", serial, "shell", "monkey", "-p", package_name, "-c", "android.intent.category.LAUNCHER", "1"])
        if proc_monkey.returncode != 0 or b"Events injected: 1" not in proc_monkey.stdout:
            return False
        foreground = self._run_cmd(["-s", serial, "shell", "dumpsys", "activity", "activities"])
        return foreground.returncode == 0 and any(
            package_name in line and ("mResumedActivity" in line or "topResumedActivity" in line)
            for line in foreground.stdout.decode("utf-8", errors="replace").splitlines()
        )

class FakeADBClient:
    """Mock ADB Client dung cho Unit Tests khi khong co may that."""
    def __init__(self, width: int = 720, height: int = 1280):
        self.width = width
        self.height = height
        self.last_tap: tuple[int, int] | None = None
        self.last_swipe: tuple[int, int, int, int, int] | None = None

    def list_devices(self) -> list[dict]:
        return [{
            "serial": "fake-emulator-5554",
            "state": "device",
            "model": "Fake_3Q_Phone",
            "connected": True
        }]

    def screencap(self, serial: str) -> np.ndarray:
        # Tao anh test mau xam voi chu nhat mau trang
        img = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        cv2.putText(img, f"FAKE SCREEN {self.width}x{self.height}", (50, 200), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        return img

    def tap(self, serial: str, x: int, y: int) -> bool:
        self.last_tap = (x, y)
        return True

    def swipe(self, serial: str, x1: int, y1: int, x2: int, y2: int, duration_ms: int = 300) -> bool:
        self.last_swipe = (x1, y1, x2, y2, duration_ms)
        return True

    def keyevent(self, serial: str, keycode: str | int) -> bool:
        return True

    def get_screen_size(self, serial: str) -> tuple[int, int]:
        return (self.width, self.height)

    def launch_app(self, serial: str, package_name: str, activity_name: str | None = None) -> bool:
        return True
