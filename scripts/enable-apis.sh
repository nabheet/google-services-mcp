#!/usr/bin/env bash
#
# Enable all Google APIs required by google-services-mcp.
#
# Idempotent: safe to run repeatedly. Already-enabled APIs are reported and
# skipped; only missing APIs are enabled.
#
# Usage:
#   bash scripts/enable-apis.sh [--project PROJECT_ID]
#
# Project resolution order:
#   1. --project flag
#   2. GOOGLE_MCP_PROJECT environment variable
#   3. `gcloud config get-value project`
#
# Requires the Google Cloud SDK (`gcloud`) to be installed and authenticated
# (`gcloud auth login`).

set -euo pipefail

APIS=(
  gmail.googleapis.com
  calendar-json.googleapis.com
  drive.googleapis.com
  people.googleapis.com
  tasks.googleapis.com
  sheets.googleapis.com
  docs.googleapis.com
  slides.googleapis.com
  youtube.googleapis.com
  forms.googleapis.com
)

PROJECT="${GOOGLE_MCP_PROJECT:-}"

usage() {
  echo "Usage: $0 [--project PROJECT_ID]"
  echo
  echo "Enable all Google APIs used by google-services-mcp in the given"
  echo "project. Project defaults to GOOGLE_MCP_PROJECT, then to the"
  echo "gcloud config project. Idempotent."
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT="${2:-}"
      if [[ -z "$PROJECT" ]]; then
        echo "--project requires a value" >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT" ]]; then
  PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
fi

if [[ -z "$PROJECT" ]]; then
  echo "No project specified." >&2
  echo "Set one of: --project PROJECT_ID, GOOGLE_MCP_PROJECT," >&2
  echo "or 'gcloud config set project PROJECT_ID'." >&2
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI not found. Install the Google Cloud SDK:" >&2
  echo "  https://cloud.google.com/sdk/docs/install" >&2
  exit 1
fi

echo "Project: $PROJECT"
echo "Checking enabled APIs..."

ENABLED="$(gcloud services list --project "$PROJECT" --enabled --format='value(config.name)')"

TO_ENABLE=()
for api in "${APIS[@]}"; do
  if grep -qxF "$api" <<<"$ENABLED"; then
    echo "  [ok] $api"
  else
    echo "  [+]  $api"
    TO_ENABLE+=("$api")
  fi
done

if [[ ${#TO_ENABLE[@]} -eq 0 ]]; then
  echo
  echo "All required APIs are already enabled."
  exit 0
fi

echo
echo "Enabling ${#TO_ENABLE[@]} API(s)..."
gcloud services enable "${TO_ENABLE[@]}" --project "$PROJECT"
echo
echo "Done. All google-services-mcp APIs are enabled."
