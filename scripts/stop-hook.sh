#!/bin/sh
# Stop-хук Claude Code (.claude/settings.json): агент не может закончить ход, пока потолки нарушены.
# stdin — JSON от Claude Code. При повторном стопе после блокировки не блокируем снова (защита от цикла).
input=$(cat)
case "$input" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;; esac
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}" || exit 0
if out=$(scripts/check-docs.sh 2>&1); then exit 0; fi
msg="Потолки docs нарушены (CLAUDE.md §8) — исправь до завершения хода:
$out"
if command -v jq >/dev/null 2>&1; then
  jq -cn --arg r "$msg" '{decision:"block",reason:$r}'
else
  esc=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk 'NR>1{printf "\\n"} {printf "%s", $0}')
  printf '{"decision":"block","reason":"%s"}\n' "$esc"
fi
exit 0
