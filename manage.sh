#!/bin/bash
# iskan-drama management script
# Usage: ./manage.sh [start|stop|restart|status]

APP_DIR="/root/iskan-drama"
PORT=3003
PID_FILE="/tmp/iskan-drama.pid"

start() {
    echo "Starting iskan-drama..."
    cd "$APP_DIR"
    nohup node server.js > /var/log/iskan-drama.log 2>&1 &
    echo $! > "$PID_FILE"
    echo "iskan-drama started (PID: $!)"
}

stop() {
    echo "Stopping iskan-drama..."
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        kill $PID
        rm "$PID_FILE"
        echo "iskan-drama stopped (PID: $PID)"
    else
        # Fallback: kill by port
        PID=$(lsof -t -i:$PORT)
        if [ ! -z "$PID" ]; then
            kill $PID
            echo "iskan-drama stopped (via port $PORT)"
        else
            echo "iskan-drama is not running"
        fi
    fi
}

status() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null; then
            echo "iskan-drama is running (PID: $PID)"
        else
            echo "iskan-drama PID file exists but process is dead"
        fi
    else
        PID=$(lsof -t -i:$PORT)
        if [ ! -z "$PID" ]; then
            echo "iskan-drama is running (PID: $PID, no PID file)"
        else
            echo "iskan-drama is not running"
        fi
    fi
}

case "$1" in
    start) start ;;
    stop) stop ;;
    restart) stop; sleep 2; start ;;
    status) status ;;
    *) echo "Usage: ./manage.sh {start|stop|restart|status}" ;;
esac
