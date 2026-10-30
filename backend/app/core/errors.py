"""Error definitions and application exceptions."""

from enum import Enum

class ErrorCode(str, Enum):
    ADB_NOT_FOUND = "ADB_NOT_FOUND"
    ADB_DISCONNECTED = "ADB_DISCONNECTED"
    DEVICE_NOT_FOUND = "DEVICE_NOT_FOUND"
    SCREENSHOT_FAILED = "SCREENSHOT_FAILED"
    INPUT_BUSY = "INPUT_BUSY"
    INPUT_FAILED = "INPUT_FAILED"
    INVALID_COORDINATES = "INVALID_COORDINATES"
    CAMERA_LOST = "CAMERA_LOST"
    SCREEN_STATE_MISMATCH = "SCREEN_STATE_MISMATCH"
    TARGET_NOT_FOUND = "TARGET_NOT_FOUND"
    NAV_TIMEOUT = "NAV_TIMEOUT"
    STOPPED = "STOPPED"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"

class StudioError(Exception):
    def __init__(self, code: ErrorCode, message: str, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}
