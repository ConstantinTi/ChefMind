#!/bin/sh
set -e

# The data volume is the one piece of state that outlives the image, and its
# ownership depends on how it was created — a bind mount takes the host's owner,
# a fresh named volume belongs to root. Either way the app must be able to write
# to it, so when we start as root we fix ownership and then drop privileges.
# Without this, a first deploy dies on "EACCES: mkdir '/data/uploads'".

DB_DIR="$(dirname "${CHEFMIND_DB_PATH:-/data/chefmind.db}")"
UPLOAD_DIR="${CHEFMIND_UPLOAD_DIR:-/data/uploads}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DB_DIR" "$UPLOAD_DIR"
  chown -R node:node "$DB_DIR" "$UPLOAD_DIR"
  exec gosu node "$@"
fi

# Already running as an unprivileged user (e.g. `docker run --user`): the volume
# must then already be writable by that user.
mkdir -p "$DB_DIR" "$UPLOAD_DIR"
exec "$@"
