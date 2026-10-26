#!/bin/sh
# validate-event.js 훅 검사: 잘못된 입력은 deny, 정상 입력은 출력 없음
cd "$(dirname "$0")/.." || exit 1
fail=0
expect_deny() {
  printf '%s' "$2" | node hooks/validate-event.js | grep -q deny || { echo "FAIL: $1"; fail=1; }
}
expect_deny "과거 날짜" '{"tool_input":{"time":{"startAt":"2020-01-01T10:00:00","endAt":"2020-01-01T11:00:00"}}}'
expect_deny "종료<시작" '{"tool_input":{"time":{"startAt":"2099-01-01T11:00:00","endAt":"2099-01-01T10:00:00"}}}'
expect_deny "5분 단위 아님" '{"tool_input":{"time":{"startAt":"2099-01-01T10:03:00","endAt":"2099-01-01T11:00:00"}}}'
expect_deny "형식 오류" '{"tool_input":{"time":{"startAt":"내일","endAt":"모레"}}}'
out=$(printf '%s' '{"tool_input":{"time":{"startAt":"2099-01-01T10:00:00","endAt":"2099-01-01T11:00:00"}}}' | node hooks/validate-event.js)
[ -z "$out" ] || { echo "FAIL: 정상 입력이 막힘"; fail=1; }
[ $fail -eq 0 ] && echo "hook tests passed"
exit $fail
