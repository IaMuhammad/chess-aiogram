"""Unit tests for app.timecontrols."""
from __future__ import annotations

from app.timecontrols import (
    CLOCK_PRESETS,
    TIME_CONTROLS,
    as_dicts,
    clock_presets_as_dicts,
    get_tc,
)


def test_get_tc_known_id():
    tc = get_tc("5+0")
    assert tc.id == "5+0"
    assert tc.base == 300
    assert tc.inc == 0
    assert tc.name == "Blitz"


def test_get_tc_unknown_id_falls_back_to_10_0():
    tc = get_tc("bogus")
    assert tc.id == "10+0"
    assert tc.base == 600


def test_as_dicts_matches_time_controls():
    dicts = as_dicts()
    assert len(dicts) == len(TIME_CONTROLS)
    for d in dicts:
        assert set(d.keys()) == {"id", "base", "inc", "name", "icon"}, d
    ids = [d["id"] for d in dicts]
    assert ids == [tc.id for tc in TIME_CONTROLS]


def test_clock_presets_as_dicts_matches_clock_presets():
    dicts = clock_presets_as_dicts()
    assert len(dicts) == len(CLOCK_PRESETS)
    for d in dicts:
        assert set(d.keys()) == {"id", "min", "sec", "mode", "name", "cat"}, d
    ids = [d["id"] for d in dicts]
    assert ids == [p.id for p in CLOCK_PRESETS]
