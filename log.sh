#!/usr/bin/env bash

set -ex

exec journalctl --no-hostname -o cat -xefu monitor
