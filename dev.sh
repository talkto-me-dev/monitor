#!/usr/bin/env bash

set -e
DIR=$(realpath $0) && DIR=${DIR%/*}
cd $DIR
set -x

export PATH="$DIR/node_modules/.bin:$PATH"

exec watchexec \
  --shell=none \
  --project-origin . \
  -w src \
  --exts js \
  -r \
  -- sh -c 'oxfmt && oxlint && ./src/main.js'
