import asyncio
import time
import logging
from typing import AsyncGenerator

class LogManager:
    def __init__(self, max_history: int = 400):
        self.logs: list[dict] = []
        self.max_history = max_history
        self._subscribers: list[asyncio.Queue] = []

    def log(self, level: str, message: str, tag: str = "SYSTEM"):
        entry = {
            "id": f"{int(time.time()*1000)}-{len(self.logs)}",
            "time": time.strftime("%H:%M:%S"),
            "level": level.upper(),
            "message": message,
            "tag": tag
        }
        self.logs.append(entry)
        if len(self.logs) > self.max_history:
            self.logs.pop(0)

        # Broadcast den tat ca websocket dang xem log
        for q in self._subscribers:
            try:
                q.put_nowait(entry)
            except Exception:
                pass

    def clear(self):
        self.logs.clear()
        self.log("INFO", "Đã xóa toàn bộ nhật ký hoạt động", "STUDIO")

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        if q in self._subscribers:
            self._subscribers.remove(q)

log_manager = LogManager()
