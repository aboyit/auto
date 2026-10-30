"""Start the configured BlueStacks instance and launch the game via real ADB."""

import asyncio
import os
from pathlib import Path
import re
import subprocess
import time

from app.adb.client import RealADBClient
from app.core.errors import StudioError
from app.services.dispatcher import device_manager, input_dispatcher

GAME_PACKAGE = "com.starlight.sg.oversea.vn"
_launch_lock = asyncio.Lock()


def _ensure_device(serial: str | None) -> str:
    client = device_manager.client
    if not isinstance(client, RealADBClient):
        raise RuntimeError("Game launch requires a real ADB connection")
    devices = [d for d in client.list_devices() if d.get("connected")]
    if serial and any(d["serial"] == serial for d in devices):
        return serial
    if not serial and devices:
        if len(devices) == 1:
            return devices[0]["serial"]
        raise RuntimeError("Multiple devices connected. Select a device before launching.")

    config = Path(os.environ.get("BLUESTACKS_CONFIG", str(Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "BlueStacks_nxt" / "bluestacks.conf")))
    player = Path(os.environ.get("BLUESTACKS_PLAYER", str(Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "BlueStacks_nxt" / "HD-Player.exe")))
    values = dict(re.findall(r'^([^=]+)="([^"]*)"', config.read_text(encoding="utf-8"), re.MULTILINE))
    instance = os.environ.get("BLUESTACKS_INSTANCE")
    if not instance:
        candidates = [key.split(".")[2] for key, value in values.items() if key.endswith(".display_name") and value.strip().casefold() == "3q"]
        if len(candidates) != 1:
            raise RuntimeError("Set BLUESTACKS_INSTANCE or name the target BlueStacks instance 3Q")
        instance = candidates[0]
    if values.get("bst.enable_adb_access") != "1":
        raise RuntimeError("Enable Android Debug Bridge in BlueStacks settings first")
    port = values.get(f"bst.instance.{instance}.status.adb_port") or values.get(f"bst.instance.{instance}.adb_port")
    if not port or not port.isdigit() or not 1 <= int(port) <= 65535:
        raise RuntimeError("No valid ADB port configured for the BlueStacks instance")
    target = f"127.0.0.1:{port}"
    if serial and serial != target:
        raise RuntimeError("Selected device is offline. Refresh devices or select automatic launch.")
    subprocess.Popen([str(player), "--instance", instance], cwd=str(player.parent), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            client._run_cmd(["connect", target], timeout=3)
            state = client._run_cmd(["-s", target, "shell", "getprop", "sys.boot_completed"], timeout=5)
            if state.returncode == 0 and state.stdout.strip() == b"1":
                return target
        except StudioError:
            # ADB can time out while Android is still booting.
            pass
        time.sleep(2)
    raise RuntimeError("BlueStacks did not finish booting within 90 seconds")


async def launch_game(serial: str | None = None) -> dict[str, str | bool]:
    async with _launch_lock:
        target = await asyncio.to_thread(_ensure_device, serial)
        async with input_dispatcher._get_lock(target):
            success = await asyncio.to_thread(device_manager.client.launch_app, target, GAME_PACKAGE)
        if not success:
            raise RuntimeError("ADB could not start Game 3Q. Check that the game is installed.")
        return {"success": True, "serial": target, "message": "Game 3Q activity started"}
