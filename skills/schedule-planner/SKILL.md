---
name: schedule-planner
description: 일정·할 일 등록, 오늘/이번 주 브리핑, 빈 시간 찾기와 일정 배치 제안, 나챗방 전송이 필요할 때 사용. "내일 3시 회의 잡아줘", "오늘 일정 알려줘", "이번 주 언제 비어?", "할 일 배치해줘" 같은 요청에 쓴다.
---

# 일정 플래너

현재 날짜·시간은 항상 `KakaotalkCal-GetCurrentTime`으로 먼저 확인한다(상대 날짜 해석 기준).

## 기능별 절차

**1. 일정·할 일 등록**
- 시간이 정해진 약속 → `KakaotalkCal-CreateEvent`, 마감만 있는 할 일 → `KakaotalkCal-CreateTask` 또는 `TodoMate-addTodoItem`.
- 등록 전 제목·시작·종료를 사용자에게 보여 주고 명확한 확인을 받은 뒤에만 호출한다. 시간은 5분 단위, 종료 미지정 시 1시간으로 제안하되 확인받는다. 음력은 지원하지 않는다.

**2. 오늘/이번 주 브리핑**
- `KakaotalkCal-GetEvent`(최대 30일), `KakaotalkCal-GetTask`, `TodoMate-loadTodoItemsByDateRange`로 일정·할 일을 모은다.
- `get_weather`와 `get_holidays`로 날씨·공휴일을 덧붙여 시간순으로 요약한다.

**3. 빈 시간 찾기·배치 제안**
- 해당 날짜의 일정을 조회해 `{"start","end"}` 목록으로 바꿔 `find_free_slots` / `plan_tasks`에 넘긴다.
- 비 예보가 있으면 야외 일정을 피하고, 공휴일·주말이면 업무성 할 일 배치를 줄이자고 제안한다.
- 제안만 하고, 등록은 사용자가 확정한 항목만 1번 절차로 진행한다.

**4. 나챗방 전송**
- `KakaotalkChat-MemoChat`으로 브리핑·배치 결과를 보낸다. 메시지는 200자 이내로 줄이고, 보내기 전에 내용을 보여 준다.

복잡한 배치나 주간 계획은 `schedule-planner:planner` 에이전트에 맡길 수 있다.
