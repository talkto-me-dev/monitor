#!/usr/bin/env bash

set -e
DIR=$(realpath $0) && DIR=${DIR%/*}
cd $DIR
set -a
. .env
set +a
set -x

ssh $DEPLOY_VPS 'bash -c "
set -ex
cd /opt
if [ -d monitor ]; then
  cd monitor
  if ! git config --global --get-all safe.directory | grep -qx /opt/monitor; then
    git config --global --add safe.directory /opt/monitor
  fi
  git checkout main && git fetch --all && git reset --hard origin/main
else
  git clone --depth=1 -b main https://github.com/talkto-me-dev/monitor.git
fi
"'

scp .env $DEPLOY_VPS:/opt/monitor/.env
scp -r conf $DEPLOY_VPS:/opt/monitor/

ssh $DEPLOY_VPS 'bash -c "
set -ex
cd /opt/monitor
chmod 600 .env
bun i
systemctl restart monitor
sleep 3
systemctl is-active --quiet monitor || { journalctl -u monitor -n 20 --no-pager; exit 1; }
"'

# 首次安装：
# cp monitor.service /etc/systemd/system/
# systemctl daemon-reload
# systemctl enable monitor
# 旧服务退役：systemctl disable --now status && rm -rf /opt/status /opt/conf
