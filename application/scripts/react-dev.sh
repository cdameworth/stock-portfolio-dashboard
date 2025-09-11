#!/bin/bash

# React Development Mode Script
# Runs both the Node.js server and Vite React dev server concurrently

echo "Starting dual development mode (Node.js + React)..."

# Function to kill background processes on exit
cleanup() {
    echo "Shutting down development servers..."
    kill $NODE_PID $VITE_PID 2>/dev/null
    exit
}

# Set up cleanup on script exit
trap cleanup INT TERM EXIT

# Start Node.js server in background
echo "Starting Node.js server on port 5000..."
PORT=5000 npm start &
NODE_PID=$!

# Wait for Node.js server to start
sleep 3

# Start Vite React dev server in background
echo "Starting React dev server on port 5173..."
cd src/react && npx vite --config ../../vite.config.react.js &
VITE_PID=$!

echo ""
echo "Development servers running:"
echo "  - Node.js API: http://localhost:5000"
echo "  - React App: http://localhost:5173"
echo ""
echo "Note: Database not configured. Set DB_* environment variables in .env file for full functionality."
echo "Press Ctrl+C to stop both servers"

# Wait for both processes
wait $NODE_PID $VITE_PID