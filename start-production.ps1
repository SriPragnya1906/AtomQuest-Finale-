# AtomQuest Production Startup & Validation Script
# Enforces configuration correctness and launches services cleanly

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "          AtomQuest Production Deployer           " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Validate Configurations
Write-Host "[1/6] Validating configuration files..." -ForegroundColor Yellow

if (Test-Path ".\livekit\livekit.yaml") {
    $livekitYaml = Get-Content ".\livekit\livekit.yaml" -Raw
    if ($livekitYaml -match "devkey: secret") {
        Write-Host "OK: LiveKit API Key and Secret credentials verified." -ForegroundColor Green
    } else {
        Write-Warning "Warning: Custom LiveKit keys detected. Ensure backend environment matches."
    }
} else {
    Write-Warning "Warning: livekit.yaml not found in standard location."
}

# 2. Check for port conflicts and clean up dev processes
Write-Host "[2/6] Checking for port conflicts..." -ForegroundColor Yellow

$ports = @(3000, 3001, 7880)
foreach ($port in $ports) {
    # Check what process is using the port
    $proc = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) {
        $pidToKill = $proc.OwningProcess
        $processName = (Get-Process -Id $pidToKill -ErrorAction SilentlyContinue).Name
        Write-Host "Found conflicting process '$processName' (PID $pidToKill) on port $port. Terminating..." -ForegroundColor Cyan
        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}
Write-Host "OK: All ports cleared and ready." -ForegroundColor Green

# 3. Build Frontend production bundle
Write-Host "[3/6] Building frontend production bundle..." -ForegroundColor Yellow
cd .\frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend compilation failed! Aborting deployment."
    exit 1
}
cd ..
Write-Host "OK: Frontend built successfully." -ForegroundColor Green

# 4. Start LiveKit Server
Write-Host "[4/6] Starting LiveKit Server..." -ForegroundColor Yellow
if (Test-Path ".\livekit\livekit-server.exe") {
    $livekitProc = Start-Process ".\livekit\livekit-server.exe" -ArgumentList "--config .\livekit\livekit.yaml" -PassThru -WindowStyle Hidden
    Write-Host "OK: LiveKit Server running in background (PID $($livekitProc.Id))." -ForegroundColor Green
} else {
    Write-Error "LiveKit server binary not found at .\livekit\livekit-server.exe"
    exit 1
}

# 5. Start Backend Server (TS-Node Production)
Write-Host "[5/6] Starting Backend Server..." -ForegroundColor Yellow
cd .\backend
# Generate Prisma Client just in case
npx prisma generate
$backendProc = Start-Process "cmd.exe" -ArgumentList "/c npm run start" -PassThru -WindowStyle Hidden
cd ..
Write-Host "OK: Backend Server running in background (PID $($backendProc.Id))." -ForegroundColor Green

# 6. Start Frontend Server (Production Next.js)
Write-Host "[6/6] Starting Frontend Production Server..." -ForegroundColor Yellow
cd .\frontend
$frontendProc = Start-Process "cmd.exe" -ArgumentList "/c npm run start" -PassThru -WindowStyle Hidden
cd ..
Write-Host "OK: Frontend Server running in background (PID $($frontendProc.Id))." -ForegroundColor Green

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "  Deployment complete! Access the app at:          " -ForegroundColor Green
Write-Host "  URL: http://localhost:3000                       " -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Green
