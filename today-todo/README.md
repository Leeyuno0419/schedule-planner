# today-todo

Claude Code 안에 오늘 일정·할 일을 패널로 상시 표시하는 모드입니다. 톡캘린더 일정과 할 일, 투두메이트 할 일을 모아 보여 주고, 패널 오른쪽 위의 ON/OFF 버튼으로 켜고 끄며, 나챗방 전송 버튼으로 목록을 카카오톡 나챗방에 보냅니다.

## 사용
- 패널 맨 윗줄 오른쪽의 `[ON]` 버튼: 패널 끄기. 꺼지면 프롬프트 위 오른쪽에 `오늘 할 일 [OFF]` 버튼이 남아 다시 켤 수 있습니다.
- `/todo`: 같은 ON/OFF 토글
- `새로고침`: 목록 다시 불러오기 (자동 갱신은 없음)
- `나챗방 전송`: `[오늘 할 일 10/27]` 형식으로 200자 이내로 전송

## 요구사항
claude.ai에 PlayMCP(톡캘린더, 투두메이트, 나챗방)가 `claude.ai PlayMCP` 이름으로 연결되어 있어야 합니다. 이름이 다르면 `hooks/register.tsx`의 `SERVER` 값을 바꾸세요.

## 설치
```
/plugin marketplace add Leeyuno0419/schedule-planner
/plugin install today-todo@schedule-planner-marketplace
```
