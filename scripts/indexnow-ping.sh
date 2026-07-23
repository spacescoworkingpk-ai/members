#!/usr/bin/env bash
# Tell Bing (and therefore ChatGPT Search, Copilot and Yandex) that pages have
# changed, so they recrawl within minutes instead of waiting weeks.
#
# Usage:
#   scripts/indexnow-ping.sh                 # pings every URL in sitemap.xml
#   scripts/indexnow-ping.sh /pricing /faq   # pings just those paths
#
# The key file f47c2c66...249.txt must be live at the site root first; Bing
# fetches it to confirm we own the domain.

set -uo pipefail

HOST="spacespk.com"
KEY="f47c2c6650f20a4b6f0a7bfb89294249"
KEY_LOCATION="https://${HOST}/${KEY}.txt"

# Build the URL list: explicit args, or everything in the live sitemap.
urls=()
if [ "$#" -gt 0 ]; then
  for p in "$@"; do
    case "$p" in
      http*) urls+=("$p") ;;
      /*)    urls+=("https://${HOST}${p}") ;;
      *)     urls+=("https://${HOST}/${p}") ;;
    esac
  done
else
  # Portable read (macOS ships bash 3.2, which has no mapfile).
  while IFS= read -r line; do
    [ -n "$line" ] && urls+=("$line")
  done < <(curl -s "https://${HOST}/sitemap.xml" | grep -oE 'https://[^<]+')
fi

if [ "${#urls[@]}" -eq 0 ]; then
  echo "indexnow: no URLs to submit." >&2
  exit 1
fi

# One batched request to the shared IndexNow endpoint (Bing + Yandex share it).
list=$(printf '"%s",' "${urls[@]}"); list="[${list%,}]"
payload=$(printf '{"host":"%s","key":"%s","keyLocation":"%s","urlList":%s}' \
  "$HOST" "$KEY" "$KEY_LOCATION" "$list")

code=$(curl -s -o /tmp/indexnow.out -w "%{http_code}" -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "$payload")

echo "indexnow: submitted ${#urls[@]} URL(s) -> HTTP $code"
# 200 or 202 means accepted. 403 means the key file is not reachable yet.
[ "$code" = "200" ] || [ "$code" = "202" ]
