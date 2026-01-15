#!/bin/bash
# Adds GOOGLE_CREDS_JSON to .env file from a Google service account JSON file
#
# Usage: ./google-creds-to-env.sh [path-to-creds.json]
#   Default: ./google-creds.json

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CREDS_FILE="${1:-${SCRIPT_DIR}/google-creds.json}"
ENV_FILE="${SCRIPT_DIR}/.env"

if [ ! -f "$CREDS_FILE" ]; then
  echo "Error: Credentials file not found at: $CREDS_FILE"
  echo "Usage: ./google-creds-to-env.sh [path-to-creds.json]"
  exit 1
fi

# Convert JSON to single line
CREDS_JSON=$(cat "$CREDS_FILE" | tr -d '\n' | sed 's/  */ /g')

# Remove existing GOOGLE_CREDS_JSON line if present
if [ -f "$ENV_FILE" ]; then
  grep -v "^GOOGLE_CREDS_JSON=" "$ENV_FILE" > "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
fi

# Append the new line
echo "GOOGLE_CREDS_JSON=${CREDS_JSON}" >> "$ENV_FILE"

echo "Added GOOGLE_CREDS_JSON to .env from: $CREDS_FILE"
