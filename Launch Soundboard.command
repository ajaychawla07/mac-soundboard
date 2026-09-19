#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

if [ -d "$DIR/dist/mac-arm64/Mac Soundboard.app" ]; then
  open "$DIR/dist/mac-arm64/Mac Soundboard.app"
else
  cd "$DIR"
  npm start
fi
