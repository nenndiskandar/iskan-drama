#!/bin/bash

# Restart the iskan-drama application

APP_DIR="/root/iskan-drama"
APP_NAME="iskan-drama"
PID_FILE="$APP_DIR/.pid"
LOG_FILE="$APP_DIR/app.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Restart the application
restart() {
    echo -e "${YELLOW}Stopping $APP_NAME...${NC}"

    # Force kill all node processes related to this app
    echo "Force killing all node processes..."
    pkill -9 -f "node.*(app.js|server.js)" 2>/dev/null || true
    sleep 3

    # Remove PID file if it exists
    if [ -f "$PID_FILE" ]; then
        rm -f "$PID_FILE"
        echo "Removed PID file"
    fi

    # Double-check and kill any remaining processes
    if ps aux | grep -E "node.*(app.js|server.js)" | grep -v grep; then
        echo -e "${RED}WARNING: Some $APP_NAME processes are still running, forcing kill...${NC}"
        pkill -9 -f "node.*(app.js|server.js)" 2>/dev/null || true
        sleep 2
    fi

    echo -e "${GREEN}Starting $APP_NAME...${NC}"

    cd "$APP_DIR"

    # Ensure CSS is built (required for production)
    if [ ! -f "public/css/styles.css" ]; then
        echo "Building CSS..."
        npm run build:css
    fi

    # Start the app
    nohup node server.js > "$LOG_FILE" 2>&1 &
    NEW_PID=$!

    # Save PID
    echo "$NEW_PID" > "$PID_FILE"

    # Wait a moment and verify it's running
    sleep 3
    if kill -0 "$NEW_PID" 2>/dev/null; then
        echo -e "${GREEN}$APP_NAME restarted successfully (PID: $NEW_PID)${NC}"
        echo -e "Log file: $LOG_FILE"
        echo -e "App URL: http://localhost:3003"
    else
        echo -e "${RED}ERROR: Failed to restart $APP_NAME${NC}"
        echo "Check log file: $LOG_FILE"
        cat "$LOG_FILE" 2>/dev/null | tail -20
        rm -f "$PID_FILE"
        return 1
    fi
}

restart