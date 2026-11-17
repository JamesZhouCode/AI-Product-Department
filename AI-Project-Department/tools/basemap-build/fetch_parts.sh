#!/usr/bin/env bash
# 多线程分段下载：fetch_parts.sh <url> <size> <parts> <output>
# 适用于不支持稳定长连接的镜像（单连接只有几十 KB/s）。每段独立重试，最后校验总大小。
set -uo pipefail
URL="$1"
SIZE="$2"
N="$3"
OUT="$4"
CHUNK=$(( (SIZE + N - 1) / N ))
WORK="${OUT}.parts"
rm -rf "$WORK"
mkdir -p "$WORK"

fetch_one() {
  local i="$1" start end file want got t
  start=$(( i * CHUNK ))
  end=$(( start + CHUNK - 1 ))
  [ "$end" -ge "$SIZE" ] && end=$(( SIZE - 1 ))
  file="$WORK/part_$(printf %03d "$i")"
  want=$(( end - start + 1 ))
  for t in 1 2 3 4 5 6; do
    curl -sL --max-time 3600 -r "${start}-${end}" -o "$file" "$URL"
    got=$(stat -c %s "$file" 2>/dev/null || echo 0)
    [ "$got" = "$want" ] && return 0
    sleep 2
  done
  echo "PART_FAILED $i ($got/$want)"
  return 1
}

for i in $(seq 0 $(( N - 1 ))); do
  fetch_one "$i" &
done
wait

cat "$WORK"/part_* > "$OUT"
GOT=$(stat -c %s "$OUT")
echo "downloaded $OUT $GOT / $SIZE"
if [ "$GOT" = "$SIZE" ]; then
  rm -rf "$WORK"
  exit 0
fi
exit 1
