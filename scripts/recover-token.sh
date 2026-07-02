#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# recover-token.sh — Push a fresh Lemma refresh token to the EC2 instance.
#
# Run this from your LOCAL machine (macOS/Linux where `lemma auth login` works):
#
#   ./scripts/recover-token.sh <EC2_IP> [SSH_KEY_PATH]
#
# Example:
#   ./scripts/recover-token.sh 3.111.166.2 ~/autoheal-key.pem
#
# What it does:
#   1. Reads the fresh refresh token from your local ~/.lemma/config.json
#   2. SSHs into EC2 and updates ~/autoheal/.env.production
#   3. Writes the token to the Docker volume (autoheal-data:/data)
#   4. Restarts the container
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

EC2_IP="${1:?Usage: $0 <EC2_IP> [SSH_KEY_PATH]}"
SSH_KEY="${2:-$HOME/autoheal-key.pem}"
SSH_USER="ubuntu"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"

echo "╭────────────────────────────────────────╮"
echo "│     Lemma Token Recovery Script        │"
echo "╰────────────────────────────────────────╯"
echo ""

# ── 1. Read fresh token from local lemma CLI config ──────────────────────────
CONFIG="$HOME/.lemma/config.json"
if [ ! -f "$CONFIG" ]; then
  echo "✗ $CONFIG not found."
  echo "  Run 'lemma auth login' on this machine first."
  exit 1
fi

REFRESH_TOKEN=$(node -e "
  const fs = require('fs');
  const c = JSON.parse(fs.readFileSync('$CONFIG', 'utf8'));
  const active = c.active_server || 'default';
  const token = c.servers?.[active]?.auth?.refresh_token || '';
  process.stdout.write(token);
")

if [ -z "$REFRESH_TOKEN" ]; then
  echo "✗ No refresh_token in $CONFIG."
  echo "  Run 'lemma auth login' on this machine first."
  exit 1
fi

TOKEN_LEN=${#REFRESH_TOKEN}
echo "✓ Found refresh token (len=$TOKEN_LEN) from $CONFIG"

# ── 2. Compute seed fingerprint (must match the app's seedFingerprint()) ─────
SEED_FP=$(node -e "
  const crypto = require('crypto');
  const fp = crypto.createHash('sha256').update('$REFRESH_TOKEN').digest('hex').slice(0, 16);
  process.stdout.write(fp);
")
echo "✓ Seed fingerprint: $SEED_FP"

# ── 3. Push to EC2 ───────────────────────────────────────────────────────────
echo ""
echo "→ Connecting to $SSH_USER@$EC2_IP ..."

# Use a heredoc to run the commands on the remote server.
# We pass the token via stdin to avoid it appearing in `ps` output.
ssh $SSH_OPTS "$SSH_USER@$EC2_IP" bash -s "$REFRESH_TOKEN" "$SEED_FP" << 'REMOTE_SCRIPT'
  set -euo pipefail
  REFRESH_TOKEN="$1"
  SEED_FP="$2"

  echo "  [EC2] Updating .env.production ..."
  ENV_FILE="$HOME/autoheal/.env.production"
  if [ -f "$ENV_FILE" ]; then
    # Replace the LEMMA_REFRESH_TOKEN line (handles tokens with special chars)
    # Use a temp file to avoid sed issues with long tokens
    python3 -c "
import re, sys
token = sys.argv[1]
with open('$ENV_FILE', 'r') as f:
    content = f.read()
content = re.sub(r'^LEMMA_REFRESH_TOKEN=.*$', 'LEMMA_REFRESH_TOKEN=' + token, content, flags=re.MULTILINE)
with open('$ENV_FILE', 'w') as f:
    f.write(content)
" "$REFRESH_TOKEN"
    echo "  [EC2] ✓ .env.production updated"
  else
    echo "  [EC2] ⚠ $ENV_FILE not found — skipping"
  fi

  echo "  [EC2] Writing token to Docker volume ..."
  TOKEN_JSON="{\"seed\":\"${SEED_FP}\",\"token\":\"${REFRESH_TOKEN}\"}"
  echo "$TOKEN_JSON" | docker run --rm -i -v autoheal-data:/data alpine sh -c 'cat > /data/lemma-refresh.json && chmod 600 /data/lemma-refresh.json'
  echo "  [EC2] ✓ /data/lemma-refresh.json written to volume"

  echo "  [EC2] Restarting container ..."
  docker restart autoheal 2>/dev/null || {
    echo "  [EC2] Container 'autoheal' not running. Starting fresh ..."
    docker stop autoheal 2>/dev/null || true
    docker rm autoheal 2>/dev/null || true
    docker run -d \
      --name autoheal \
      --env-file ~/autoheal/.env.production \
      -e "GITHUB_APP_PRIVATE_KEY=$(cat ~/github-app-key.pem)" \
      -e LEMMA_REFRESH_TOKEN_FILE=/data/lemma-refresh.json \
      -v autoheal-data:/data \
      -p 3000:3000 \
      --restart unless-stopped \
      autoheal:latest
  }
  echo "  [EC2] ✓ Container restarted"

  echo ""
  echo "  [EC2] Waiting 10s for startup ..."
  sleep 10

  echo "  [EC2] Container status:"
  docker ps --filter name=autoheal --format "    {{.Status}}"
  echo ""
  echo "  [EC2] Last 15 log lines:"
  docker logs --tail 15 autoheal 2>&1 | sed 's/^/    /'
REMOTE_SCRIPT

echo ""
echo "╭────────────────────────────────────────╮"
echo "│     ✅ Recovery complete!              │"
echo "╰────────────────────────────────────────╯"
echo ""
echo "Verify: curl http://$EC2_IP:3000/api/health"
