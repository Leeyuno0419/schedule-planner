"""일정 플래너 MCP 서버: 날씨(Open-Meteo)·공휴일(Nager.Date) 조회와 빈 시간 계산·배치."""
import json
import urllib.request
from datetime import datetime, timedelta

from mcp.server.mcpserver import MCPServer

mcp = MCPServer("planner")

CITIES = {
    "서울": (37.5665, 126.9780), "부산": (35.1796, 129.0756), "인천": (37.4563, 126.7052),
    "대구": (35.8714, 128.6014), "대전": (36.3504, 127.3845), "광주": (35.1595, 126.8526),
    "부천": (37.5034, 126.7660), "제주": (33.4996, 126.5312),
}
WMO = {0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "안개",
       51: "이슬비", 53: "이슬비", 55: "이슬비", 61: "비", 63: "비", 65: "강한 비",
       71: "눈", 73: "눈", 75: "많은 눈", 80: "소나기", 81: "소나기", 82: "강한 소나기",
       95: "뇌우"}
RAIN_CODES = {51, 53, 55, 61, 63, 65, 71, 73, 75, 80, 81, 82, 95}


def _get_json(url: str):
    with urllib.request.urlopen(url, timeout=10) as res:
        return json.loads(res.read().decode("utf-8"))


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value[:19])


def _round_up_5(dt: datetime) -> datetime:
    dt = dt.replace(second=0, microsecond=0)
    return dt + timedelta(minutes=(-dt.minute) % 5)


def compute_free_slots(events, date, day_start="09:00", day_end="22:00", min_minutes=30):
    """events: [{"start","end"}] ISO 문자열. 하루 범위 안의 빈 구간 [(start, end)]을 반환."""
    window_start = _parse(f"{date}T{day_start}:00")
    window_end = _parse(f"{date}T{day_end}:00")
    busy = []
    for e in events:
        s, t = _parse(e["start"]), _parse(e["end"])
        if t > window_start and s < window_end:
            busy.append((max(s, window_start), min(t, window_end)))
    busy.sort()
    slots, cursor = [], window_start
    for s, t in busy:
        if s > cursor:
            slots.append((cursor, s))
        cursor = max(cursor, t)
    if cursor < window_end:
        slots.append((cursor, window_end))
    return [(s, t) for s, t in slots if (t - s) >= timedelta(minutes=min_minutes)]


def place_tasks(slots, tasks, buffer_minutes=10):
    """할 일을 앞 슬롯부터 순서대로 배치. 배치 사이에 buffer를 둔다."""
    slots = [list(s) for s in slots]
    placed, unplaced = [], []
    for task in tasks:
        need = timedelta(minutes=task["minutes"])
        for slot in slots:
            start = _round_up_5(slot[0])
            if start + need <= slot[1]:
                placed.append({"title": task["title"], "start": start.isoformat(),
                               "end": (start + need).isoformat()})
                slot[0] = start + need + timedelta(minutes=buffer_minutes)
                break
        else:
            unplaced.append(task["title"])
    return placed, unplaced


@mcp.tool()
def get_weather(city: str = "서울", days: int = 3) -> str:
    """도시(서울·부산·인천·대구·대전·광주·부천·제주)의 일별 날씨 예보를 조회한다. days는 1~7."""
    if city not in CITIES:
        return f"지원하지 않는 도시입니다. 지원 도시: {', '.join(CITIES)}"
    lat, lon = CITIES[city]
    days = max(1, min(days, 7))
    url = ("https://api.open-meteo.com/v1/forecast"
           f"?latitude={lat}&longitude={lon}&timezone=Asia%2FSeoul&forecast_days={days}"
           "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max")
    d = _get_json(url)["daily"]
    lines = []
    for i, day in enumerate(d["time"]):
        code = d["weather_code"][i]
        prob = d["precipitation_probability_max"][i] or 0
        rain = code in RAIN_CODES or prob >= 60
        lines.append(f"{day} {WMO.get(code, '알 수 없음')} {d['temperature_2m_min'][i]}~"
                     f"{d['temperature_2m_max'][i]}°C 강수확률 {prob}%"
                     f"{' (야외 일정 비추천)' if rain else ''}")
    return "\n".join(lines)


@mcp.tool()
def get_holidays(year: int, month: int = 0) -> str:
    """한국 공휴일 목록을 조회한다. month가 0이면 해당 연도 전체."""
    items = _get_json(f"https://date.nager.at/api/v3/PublicHolidays/{year}/KR")
    rows = [f"{h['date']} {h['localName']}" for h in items
            if month == 0 or int(h["date"][5:7]) == month]
    return "\n".join(rows) if rows else "해당 기간에 공휴일이 없습니다."


@mcp.tool()
def find_free_slots(events: list[dict], date: str, day_start: str = "09:00",
                    day_end: str = "22:00", min_minutes: int = 30) -> str:
    """하루의 빈 시간을 계산한다. events는 [{"start":"YYYY-MM-DDTHH:MM:SS","end":"..."}] 형식(톡캘린더 조회 결과를 변환), date는 YYYY-MM-DD."""
    slots = compute_free_slots(events, date, day_start, day_end, min_minutes)
    if not slots:
        return "조건에 맞는 빈 시간이 없습니다."
    return "\n".join(f"{s:%H:%M}~{t:%H:%M} ({int((t - s).total_seconds() // 60)}분)" for s, t in slots)


@mcp.tool()
def plan_tasks(events: list[dict], date: str, tasks: list[dict], day_start: str = "09:00",
               day_end: str = "22:00", buffer_minutes: int = 10) -> str:
    """할 일을 빈 시간에 배치하는 제안을 만든다. tasks는 [{"title":"...","minutes":60}], events는 find_free_slots와 같은 형식. 등록은 하지 않는다."""
    slots = compute_free_slots(events, date, day_start, day_end, min_minutes=5)
    placed, unplaced = place_tasks(slots, tasks, buffer_minutes)
    return json.dumps({"placed": placed, "unplaced": unplaced}, ensure_ascii=False)


if __name__ == "__main__":
    mcp.run()
