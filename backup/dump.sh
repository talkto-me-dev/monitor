#!/usr/bin/env bash
# 导出 PG 表结构（注意 pg_dump 主版本需 >= 服务端版本；
# 本地 docker 库可直接用：docker exec -i status-pg pg_dump -U status -d status --schema-only --no-owner --no-privileges）

set -e
DIR=$(realpath $0) && DIR=${DIR%/*}
cd $DIR
set -a
. ../.env
set +a

PG_DUMP=pg_dump
if ! command -v pg_dump &>/dev/null; then
  if command -v apt-get &>/dev/null; then
    apt-get install -y postgresql-client
  elif command -v brew &>/dev/null; then
    # libpq 是 keg-only，不会进 PATH，用绝对路径调用
    brew install libpq
    PG_DUMP="$(brew --prefix libpq)/bin/pg_dump"
  fi
fi

NAME=db_$DB_NAME.txt

PGPASSWORD=$DB_PASSWORD $PG_DUMP \
  -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  --schema-only --no-owner --no-privileges \
  >$NAME.tmp
mv $NAME.tmp $NAME
