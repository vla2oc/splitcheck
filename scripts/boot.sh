#!/bin/sh
# Генерирует docs/BOOT.md — единственное, что агент читает при старте сессии (CLAUDE.md §6).
# Детерминированно, без даты; руками не правится; в .gitignore. Файл пишется ВСЕГДА (SessionStart-хук
# делает `cat` независимо от результата); при превышении потолка — предупреждение первой строкой и exit 1.
set -u
cd "$(dirname "$0")/.." || exit 2
out=docs/BOOT.md
max=4096
body=$(
  echo "## Git"
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "- последний коммит: $(git log -1 --format='%h %ad %s' --date=short 2>/dev/null || echo 'нет коммитов')"
    echo "- незакоммиченных файлов: $(git status --porcelain | wc -l | tr -d ' ')"
  else
    echo "- не git-репозиторий"
  fi
  echo
  # STATE.md целиком, без HTML-комментариев. Секцию исключить: awk '/^## /{skip=($0 ~ /^## Имя/)} !skip && !/^<!--/'
  awk '!/^<!--/' docs/STATE.md
  echo
  echo "## Последние 3 решения (полный список — docs/DECISIONS.md)"
  grep -E '^[0-9]{4}-' docs/DECISIONS.md | tail -3
  echo
  echo "## NOT_NOW (docs/NOT_NOW.md)"
  grep -E '^- ' docs/NOT_NOW.md
)
head="# BOOT — сгенерировано scripts/boot.sh, не редактировать"
b=$(( $(printf '%s\n\n%s\n' "$head" "$body" | wc -c) ))
if [ "$b" -le "$max" ]; then
  printf '%s\n\n%s\n' "$head" "$body" > "$out"
  echo "boot: $out — $b байт (потолок $max)" >&2
  exit 0
fi
printf '%s\n\n**ПРЕВЫШЕН ПОТОЛОК: %s байт > %s. Режь docs/STATE.md («Сделано» → docs/log/) или docs/NOT_NOW.md, число не увеличивай.**\n\n%s\n' "$head" "$b" "$max" "$body" > "$out"
echo "boot: $out — $b байт, ПРЕВЫШЕН потолок $max — режь STATE.md / NOT_NOW.md" >&2
exit 1
