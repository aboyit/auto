# Scenario Engine session progress

`GET /api/scenarios/engine/progress` returns the current in-memory engine session. No game connection is required to read it. Example (timestamps are UTC ISO 8601; `null` means not scheduled):

```json
{
  "session_id": "8c004b44f7c54d9088c9883380d58035",
  "is_running": true,
  "serial": "selected-device",
  "started_at": "2026-10-31T06:00:00+00:00",
  "ended_at": null,
  "total_runs": 1,
  "success_count": 0,
  "failure_count": 0,
  "active_step": {
    "scenario_id": "collect",
    "step_id": "tap",
    "step_name": "Collect",
    "cycle": 1,
    "total_cycles": 1,
    "rep": 1,
    "total_reps": 1,
    "call_stack": []
  },
  "scenarios": [
    {
      "scenario_id": "collect",
      "scenario_name": "Collect",
      "enabled": true,
      "interval_minutes": 5,
      "next_run_at": null,
      "run_count": 1,
      "success_count": 0,
      "failure_count": 0,
      "reports": [
        {
          "run_id": "c0a6cca61a754a20b4c5bc2caf45e849",
          "scenario_id": "collect",
          "scenario_name": "Collect",
          "started_at": "2026-10-31T06:00:00+00:00",
          "ended_at": null,
          "final_status": "running",
          "stop_reason": "",
          "total_duration_sec": 0.0,
          "total_steps": 1,
          "success_count": 1,
          "failed_count": 0,
          "steps": [{"step_id": "open", "success": true}]
        }
      ]
    }
  ]
}
```

The current run is the last entry in its scenario's `reports`; its `steps` contains completed steps so far. `active_step` and `call_stack` identify work in progress and may be `null` before the first step. Once finished, a report's `final_status` is `success`, `failed`, or `stopped`, and `ended_at` is populated. Session and scenario counts include the running attempt, while success/failure counts include only completed attempts. Disabled scenarios, running scenarios, stopped engines, and once-only scenarios already executed in this session have no `next_run_at`. Enabled periodic scenarios use their latest completion time (or persisted last-run time before their first attempt). Reports are process-memory session history, reset on each new engine start, and are not persisted across backend restarts.

Run offline tests with `D:\GAME 3Q\.venv\Scripts\python.exe -m pytest backend\tests\unit -q` from the repository root. No ADB/game integration is exercised by these tests.
