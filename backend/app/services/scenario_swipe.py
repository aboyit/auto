"""Execute the scenario swipe action, preserving coordinate-based legacy steps."""

from collections.abc import Callable

from app.core.scenario_models import ScenarioStep
from app.services.dispatcher import input_dispatcher


async def execute_swipe(serial: str, step: ScenarioStep, should_stop: Callable[[], bool]) -> bool:
    if should_stop():
        return False
    if step.swipe_directions:
        if not any(item.count for item in step.swipe_directions):
            return True
        return await input_dispatcher.swipe_sequence(
            serial, [(item.direction, item.count) for item in step.swipe_directions],
            step.swipe_distance_ratio, step.duration_ms, should_stop,
        )
    sf, st = step.swipe_from, step.swipe_to
    return await input_dispatcher.swipe(serial, sf.x, sf.y, st.x, st.y, duration_ms=step.duration_ms)
