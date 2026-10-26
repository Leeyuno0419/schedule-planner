// 톡캘린더 일정 등록 직전에 시간 값을 검사한다. 잘못된 값이면 호출을 막고 이유를 Claude에게 돌려준다.
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  const input = JSON.parse(raw || "{}");
  const time = (input.tool_input || {}).time || {};
  const problem = check(time, new Date());
  if (problem) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: problem,
      },
    }));
  }
});

function check(time, now) {
  const re = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/;
  if (!re.test(time.startAt || "") || !re.test(time.endAt || "")) return "시간 형식은 YYYY-MM-DDThh:mm:00 이어야 합니다.";
  if (Number(time.startAt.slice(14, 16)) % 5 || Number(time.endAt.slice(14, 16)) % 5) return "시간은 5분 단위여야 합니다.";
  if (time.endAt < time.startAt) return "종료 시각이 시작 시각보다 빠릅니다.";
  if (!time.allDay && time.endAt === time.startAt) return "시작과 종료 시각이 같습니다.";
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (time.startAt.slice(0, 10) < today) return `과거 날짜(${time.startAt.slice(0, 10)})에는 일정을 등록할 수 없습니다.`;
  return null;
}
