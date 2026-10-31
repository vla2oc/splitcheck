#!/bin/sh
# Однократно после копирования набора в новый проект: права, git-хуки, первая проверка, первый BOOT.
set -eu
cd "$(dirname "$0")/.."
chmod +x scripts/*.sh .githooks/pre-commit
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || git init -q
git config core.hooksPath .githooks
echo "setup: core.hooksPath = .githooks (хуки в репо, переезжают с клоном)"
scripts/check-docs.sh
scripts/boot.sh
echo "setup: готово. Дальше: «Цель MVP» в docs/STATE.md → docs/PHASE1_<имя>.md по PHASE_TEMPLATE.md → первый коммит."
