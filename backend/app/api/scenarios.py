"""API Router quan ly Kich ban Macro (Scenarios)."""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.scenario_models import Scenario, ScenarioStep, load_scenarios, save_scenarios
from app.services.scenario_runner import execute_scenario, execute_scenario_step, scenario_engine, scenario_tracker

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])

@router.get("")
async def get_all_scenarios():
    return load_scenarios()

@router.post("")
async def update_all_scenarios(scenarios: list[Scenario]):
    save_scenarios(scenarios)
    return {"status": "ok", "scenarios": scenarios}

class RunScenarioRequest(BaseModel):
    serial: str

class RunUntilRequest(BaseModel):
    serial: str
    stop_step_id: str

@router.post("/{scenario_id}/run")
async def run_scenario_endpoint(scenario_id: str, payload: RunScenarioRequest):
    if not payload.serial:
        raise HTTPException(status_code=400, detail="Thiếu mã serial thiết bị")
    success = await execute_scenario(payload.serial, scenario_id)
    return {"status": "ok", "success": success}

@router.post("/{scenario_id}/run-until")
async def run_until_endpoint(scenario_id: str, payload: RunUntilRequest):
    if not payload.serial:
        raise HTTPException(status_code=400, detail="Thiếu mã serial thiết bị")
    if not payload.stop_step_id:
        raise HTTPException(status_code=400, detail="Thiếu ID bước đích cần dừng")
    success = await execute_scenario(payload.serial, scenario_id, stop_step_id=payload.stop_step_id)
    return {"status": "ok", "success": success}

class TestStepRequest(BaseModel):
    serial: str
    step: ScenarioStep

@router.post("/step/test")
async def test_step_endpoint(payload: TestStepRequest):
    if not payload.serial:
        raise HTTPException(status_code=400, detail="Thiếu mã serial thiết bị")
    scenarios = load_scenarios()
    sc_map = {s.id: s for s in scenarios}
    scenario_tracker.set_running("", "Thử nghiệm bước", 1)
    try:
        success = await execute_scenario_step(payload.serial, payload.step, sc_map)
    finally:
        scenario_tracker.set_idle()
    return {"status": "ok", "success": success}

@router.post("/stop")
async def stop_scenario_endpoint():
    """Dừng khẩn cấp kịch bản đang chạy thử."""
    scenario_tracker.request_stop()
    return {"status": "stopped"}

@router.get("/execution/status")
async def get_execution_status():
    return {
        **scenario_tracker.state,
        "current_run_steps": list(scenario_tracker.current_run_steps),
        "history": list(scenario_tracker.current_run_steps),
    }

@router.get("/execution/report")
async def get_execution_report():
    """Lấy báo cáo tóm tắt chi tiết lần chạy thử gần nhất."""
    report = scenario_tracker.get_last_report()
    if not report:
        return {"status": "none", "report": None}
    return {"status": "ok", "report": report}

class EngineControlRequest(BaseModel):
    serial: str

@router.post("/engine/start")
async def start_scenario_engine(payload: EngineControlRequest):
    if not payload.serial:
        raise HTTPException(status_code=400, detail="Thiếu mã serial thiết bị")
    scenario_engine.start(payload.serial)
    return {"status": "running", "serial": payload.serial}

@router.post("/engine/stop")
async def stop_scenario_engine():
    scenario_engine.stop()
    return {"status": "stopped"}

@router.get("/engine/status")
async def get_engine_status():
    return {
        "is_running": scenario_engine.is_running,
        "serial": scenario_engine.active_serial
    }

