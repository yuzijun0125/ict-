#!/usr/bin/env bash
set -e
gateway=$(ip route | awk '/default/ {print $3; exit}')
exec python3 /mnt/d/NexentModels/runtime/nexent-mcp-proxy.py 0.0.0.0 8090 "$gateway" 8090