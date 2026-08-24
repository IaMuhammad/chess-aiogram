"""Time-control presets shown on the Home screen (mirrors the frontend list)."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TimeControl:
    id: str          # "5+0"
    base: int        # base seconds
    inc: int         # increment seconds per move
    name: str        # "Blitz"
    icon: str        # icon name used by the frontend


TIME_CONTROLS: list[TimeControl] = [
    TimeControl("1+0", 60, 0, "Bullet", "bolt"),
    TimeControl("3+2", 180, 2, "Blitz", "bolt"),
    TimeControl("5+0", 300, 0, "Blitz", "bolt"),
    TimeControl("10+0", 600, 0, "Rapid", "clock"),
    TimeControl("15+10", 900, 10, "Rapid", "clock"),
    TimeControl("30+0", 1800, 0, "Classical", "rabbit"),
]

_BY_ID = {tc.id: tc for tc in TIME_CONTROLS}


def get_tc(tc_id: str) -> TimeControl:
    """Return a time control by id, defaulting to 10+0 if unknown."""
    return _BY_ID.get(tc_id, _BY_ID["10+0"])


def as_dicts() -> list[dict]:
    return [tc.__dict__ for tc in TIME_CONTROLS]


# ── Chess-clock presets ──────────────────────────────────────────────
# Catalog for the standalone two-player "Chess clock" mode (one device, two
# players). The clock runs entirely client-side; this is the server-side source
# of truth for the preset list, mirroring the frontend's built-in fallback.


@dataclass(frozen=True)
class ClockPreset:
    id: str          # "5+3"
    min: int         # base minutes
    sec: int         # increment / delay seconds
    mode: str        # "inc" | "delay"
    name: str        # "Blitz"
    cat: str         # category heading shown in setup ("Bullet", "Blitz", …)


CLOCK_PRESETS: list[ClockPreset] = [
    ClockPreset("1+0", 1, 0, "inc", "Bullet", "Bullet"),
    ClockPreset("1+1", 1, 1, "inc", "Bullet", "Bullet"),
    ClockPreset("3+0", 3, 0, "inc", "Blitz", "Blitz"),
    ClockPreset("3+2", 3, 2, "inc", "Blitz", "Blitz"),
    ClockPreset("5+0", 5, 0, "inc", "Blitz", "Blitz"),
    ClockPreset("5+3", 5, 3, "inc", "Blitz", "Blitz"),
    ClockPreset("10+0", 10, 0, "inc", "Rapid", "Rapid"),
    ClockPreset("10+5", 10, 5, "inc", "Rapid", "Rapid"),
    ClockPreset("15+10", 15, 10, "inc", "Rapid", "Rapid"),
    ClockPreset("30+0", 30, 0, "inc", "Classical", "Classical"),
    ClockPreset("30+30", 30, 30, "inc", "Classical", "Classical"),
]


def clock_presets_as_dicts() -> list[dict]:
    return [p.__dict__ for p in CLOCK_PRESETS]
