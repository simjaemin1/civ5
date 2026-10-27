#!/bin/bash
# 맥 Finder에서 더블클릭하면 터미널이 열리며 핫시트로 실행된다 (civ5.sh와 같음)
exec "$(dirname "$0")/civ5.sh" "$@"
