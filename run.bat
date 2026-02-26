@echo off
where docker >nul 2>&1
if errorlevel 1 (
  echo Docker not found. Please install Docker Desktop.
  exit /b 1
)

echo Starting VPCargo...
docker compose up -d --build
if errorlevel 1 exit /b 1

echo VPCargo is starting on http://localhost:3000
start "" http://localhost:3000
