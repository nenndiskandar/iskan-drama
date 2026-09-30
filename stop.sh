#!/bin/bash

# Stop the iskan-drama application

APP_DIR="/root/iskan-drama"
APP_NAME="iskan-drama"
PID_FILE="$APP_DIR/.pid"
LOG_FILE="$APP_DIR/app.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Stop the application
stop() {
    echo -e "${YELLOW}Stopping $APP_NAME...${NC}"

    # Check for PID file first
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            echo "Sent SIGTERM to $APP_NAME (PID: $PID)"
            # Wait for graceful shutdown
            for i in {1..10}; do
                if ! kill -0 "$PID" 2>/dev/null; then
                    break
                fi
                sleep 1
            done
            # Force kill if still running
            if kill -0 "$PID" 2>/dev/null; then
                echo "Force killing $APP_NAME..."
                kill -9 "$PID"
            fi
        else
            echo "Process $PID not running"
        fi
        rm -f "$PID_FILE"
    fi

    # Try to find and kill by pattern if PID file didn't exist or process didn't start
    echo "Looking for running $APP_NAME processes..."
    pkill -f "node.*(app.js|server.js)" && echo "Killed node processes" || true
    sleep 2

    # Double-check
    if ps aux | grep -E "node.*(app.js|server.js)" | grep -v grep; then
        echo -e "${RED}WARNING: Some $APP_NAME processes may still be running${NC}"
        pkill -9 -f "node.*(app.js|server.js)" 2>/dev/null || true
    else
        echo -e "${GREEN}$APP_NAME stopped successfully${NC}"
    fi
}

stop