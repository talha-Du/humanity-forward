#!/bin/sh
# Starte Backend und Frontend

echo "🚀 Starting Community Resource Mapper..."

# Starte Backend im Hintergrund
node server.js &
BACKEND_PID=$!

# Starte Nginx
nginx

echo "✅ Backend running on port 3000"
echo "✅ Frontend running on port 80"
echo "🌍 Open http://localhost in your browser"

# Warte auf Prozesse
wait $BACKEND_PID
