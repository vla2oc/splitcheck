#!/bin/sh
# Потолки из CLAUDE.md §8. Exit 0 — всё в норме; 1 — нарушение (текст на stdout); 2 — не смог проверить.
# Зовут: .githooks/pre-commit, scripts/stop-hook.sh (Claude Code Stop), scripts/setup.sh. Числа менять здесь + строка в DECISIONS.md.
set -u
cd "$(dirname "$0")/.." || exit 2

STATE_MAX_LINES=80
STATE_MAX_HEADINGS=6
STATE_MAX_LINE_CHARS=300
LINE_MAX_CHARS=200
BOOT_MAX_BYTES=4096
CLAUDE_MAX_BYTES=8192
STARTUP_MAX_BYTES=12288   # CLAUDE.md + BOOT.md — всё, что агент читает при старте

# Символы ≠ байты: на macOS `awk length` считает байты, поэтому только `wc -m` под UTF-8-локалью.
for loc in "${LC_ALL:-}" en_US.UTF-8 C.UTF-8; do
  [ -n "$loc" ] || continue
  if [ "$(LC_ALL=$loc printf 'я' | LC_ALL=$loc wc -m | tr -d ' ')" = "1" ]; then export LC_ALL=$loc; break; fi
done
[ "$(printf 'я' | wc -m | tr -d ' ')" = "1" ] || { echo "check-docs: нет UTF-8-локали, не могу считать символы"; exit 2; }

fail=0
say() { echo "check-docs: $*"; fail=1; }
chars() { printf '%s' "$1" | wc -m | tr -d ' '; }
bytes() { wc -c < "$1" | tr -d ' '; }

# 1. STATE.md — строки, заголовки, порядок дат в «Сделано» (новое сверху)
if [ -f docs/STATE.md ]; then
  n=$(wc -l < docs/STATE.md | tr -d ' ')
  [ "$n" -le "$STATE_MAX_LINES" ] || say "docs/STATE.md: $n строк, потолок $STATE_MAX_LINES — перенеси историю в docs/log/"
  h=$(grep -c '^## ' docs/STATE.md || true)
  [ "$h" -le "$STATE_MAX_HEADINGS" ] || say "docs/STATE.md: $h заголовков «##», потолок $STATE_MAX_HEADINGS"
  ln=0
  while IFS= read -r line || [ -n "$line" ]; do
    ln=$((ln + 1)); c=$(chars "$line")
    [ "$c" -le "$STATE_MAX_LINE_CHARS" ] || say "docs/STATE.md:$ln — $c символов, потолок $STATE_MAX_LINE_CHARS"
  done < docs/STATE.md
  bad=$(awk '/^## /{in_done = ($0 ~ /^## Сделано/)} in_done && /^- [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/ {d=substr($2,1,10); if (prev != "" && d > prev) {print NR": "d" после "prev; exit} prev=d}' docs/STATE.md)
  [ -z "$bad" ] || say "docs/STATE.md:$bad — в «Сделано» новое должно быть сверху"
else
  say "нет docs/STATE.md"
fi

# 2. Построчные файлы: пустые и «#…» строки пропускаем, остальные — формат + длина
check_lines() { # файл, ERE-формат, подсказка
  f=$1; re=$2; hint=$3
  [ -f "$f" ] || { say "нет $f"; return; }
  ln=0
  while IFS= read -r line || [ -n "$line" ]; do
    ln=$((ln + 1))
    case "$line" in ''|'#'*) continue ;; esac
    c=$(chars "$line")
    [ "$c" -le "$LINE_MAX_CHARS" ] || say "$f:$ln — $c символов, потолок $LINE_MAX_CHARS"
    printf '%s\n' "$line" | grep -Eq "$re" || say "$f:$ln — не по формату «${hint}»"
  done < "$f"
}
check_lines docs/DECISIONS.md '^[0-9]{4}-[0-9]{2}-[0-9]{2} \| [^|]+ \| [^|]+$' 'YYYY-MM-DD | решение | причина'
check_lines docs/NOT_NOW.md '^- .+$' '- <пункт>'

# 3. Байтовые потолки
[ -f CLAUDE.md ] || say "нет CLAUDE.md"
if [ -f CLAUDE.md ]; then
  b=$(bytes CLAUDE.md)
  [ "$b" -le "$CLAUDE_MAX_BYTES" ] || say "CLAUDE.md: $b байт, потолок $CLAUDE_MAX_BYTES"
fi
if [ -f docs/BOOT.md ]; then
  b=$(bytes docs/BOOT.md)
  [ "$b" -le "$BOOT_MAX_BYTES" ] || say "docs/BOOT.md: $b байт, потолок $BOOT_MAX_BYTES — режь STATE.md / NOT_NOW.md"
  t=$(( $(bytes CLAUDE.md) + b ))
  echo "check-docs: стартовое чтение = CLAUDE.md $(bytes CLAUDE.md) + BOOT.md $b = $t байт (потолок $STARTUP_MAX_BYTES)"
  [ "$t" -le "$STARTUP_MAX_BYTES" ] || say "стартовое чтение $t байт, потолок $STARTUP_MAX_BYTES"
fi

[ "$fail" -eq 0 ] && echo "check-docs: ok"
exit "$fail"
