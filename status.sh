#!/bin/bash

# Check if iskan-drama server is running

APP_DIR="/root/iskan-drama"
APP_NAME="iskan-drama"
PID_FILE="$APP_DIR/.pid"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check status
check_status() {
    echo "Checking $APP_NAME status..."

    # Check for PID file
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo -e "${GREEN}$APP_NAME is running (PID: $PID)${NC}"
            
            # Check if it's listening on port 3003
            if ss -tlnp | grep :3003 | grep "PID=$PID"; then
                echo -e "${GREEN}$APP_NAME is listening on port 3003${NC}"
                
                # Try to reach the health endpoint
                curl -s -f http://localhost:3003/health > /dev/null && echo -e "${GREEN}Health check passed${NC}" || echo -e "${YELLOW}Health check failed${NC}"
            else
                echo -e "${RED}$APP_NAME PID exists but not listening on port 3003${NC}"
            fi
            return 0
        else
            echo -e "${RED}$APP_NAME PID file exists but process is not running${NC}"
            rm -f "$PID_FILE"
            return 1
        fi
    else
        echo -e "${YELLOW}$APP_NAME is not running (no PID file)${NC}"
        return 3
    fi
}

check_status