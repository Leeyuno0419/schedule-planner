import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
from planner_server import compute_free_slots, place_tasks  # noqa: E402

EVENTS = [
    {"start": "2026-10-27T10:00:00", "end": "2026-10-27T11:00:00"},
    {"start": "2026-10-27T13:00:00", "end": "2026-10-27T14:30:00"},
]


def fmt(slots):
    return [(s.strftime("%H:%M"), t.strftime("%H:%M")) for s, t in slots]


def test_free_slots_between_events():
    slots = compute_free_slots(EVENTS, "2026-10-27", "09:00", "18:00", 30)
    assert fmt(slots) == [("09:00", "10:00"), ("11:00", "13:00"), ("14:30", "18:00")]


def test_min_minutes_filters_short_gaps():
    slots = compute_free_slots(EVENTS, "2026-10-27", "09:00", "18:00", 90)
    assert fmt(slots) == [("11:00", "13:00"), ("14:30", "18:00")]


def test_overlapping_and_out_of_window_events():
    events = EVENTS + [{"start": "2026-10-27T10:30:00", "end": "2026-10-27T12:00:00"},
                       {"start": "2026-10-27T07:00:00", "end": "2026-10-27T08:00:00"}]
    slots = compute_free_slots(events, "2026-10-27", "09:00", "18:00", 30)
    assert fmt(slots) == [("09:00", "10:00"), ("12:00", "13:00"), ("14:30", "18:00")]


def test_place_tasks_uses_buffer_and_reports_unplaced():
    slots = compute_free_slots(EVENTS, "2026-10-27", "09:00", "18:00", 5)
    tasks = [{"title": "A", "minutes": 50}, {"title": "B", "minutes": 120}, {"title": "C", "minutes": 600}]
    placed, unplaced = place_tasks(slots, tasks, 10)
    assert placed[0]["start"].endswith("09:00:00") and placed[0]["end"].endswith("09:50:00")
    assert placed[1]["start"].endswith("11:00:00")
    assert unplaced == ["C"]
