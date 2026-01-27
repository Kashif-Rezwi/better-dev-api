#!/bin/bash

# Configuration
API_URL="http://localhost:3000"
TOKEN="YOUR_JWT_TOKEN_HERE" # We'll need a real token to test attachment upload

echo "🚀 Starting Architecture Stress Test..."

# 1. Start a heavy OCR process in the background
# We'll use a mock upload that triggers the FileProcessor
echo "⏳ Step 1: Triggering a heavy file process..."
curl -X POST "$API_URL/attachment/upload" \
     -H "Authorization: Bearer $TOKEN" \
     -F "file=@test/large-image.jpg" \
     -F "conversationId=some-uuid" \
     -s -o /dev/null &

# 2. Immediately try to hit the health check
echo "⏱️ Step 2: Attempting to hit /health immediately after..."
start_time=$(date +%s)
curl -s "$API_URL/health" | JSON_PP
end_time=$(date +%s)

duration=$((end_time - start_time))
echo "✅ Health check took $duration seconds."

if [ $duration -gt 1 ]; then
    echo "⚠️ ARCHITECTURE FAILURE DETECTED: The server froze for $duration seconds while processing a file."
else
    echo "✨ Architecture is responsive."
fi
