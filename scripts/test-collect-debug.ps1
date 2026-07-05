# Debug: test the full collect logic step by step
$diskLetter = 'C'

# Step 1: Build procInfo
$procInfo = @{}
Get-CimInstance Win32_Process -Property ProcessId,ExecutablePath,CommandLine | Where-Object {$_.ProcessId -gt 4} | ForEach-Object {
    $drives = @{}
    if ($_.ExecutablePath -and $_.ExecutablePath -match '^([A-Z]):') {
        $drives[$Matches[1]] = $true
    }
    if ($_.CommandLine) {
        foreach ($m in [regex]::Matches($_.CommandLine, '(?<=\s|"|\=)([A-Z]):\\\\')) {
            $drives[$m.Groups[1].Value] = $true
        }
    }
    $procInfo[$_.ProcessId] = @{Exe=$_.ExecutablePath; Drives=$drives.Keys; NoPath=(-not $_.ExecutablePath)}
}

Write-Host "Step 1: procInfo entries: $($procInfo.Count)"

# Step 2: Get wmic data
$lines = wmic process where "ProcessId>4" get Name,ProcessId,ReadTransferCount,WriteTransferCount /format:csv 2>$null
$allProcs = @()
$headerSkipped = $false
foreach ($line in $lines) {
    $line = $line.Trim()
    if ($line -eq '') { continue }
    if (-not $headerSkipped) { $headerSkipped = $true; continue }
    $parts = $line -split ','
    if ($parts.Length -ge 5) {
        $name = $parts[1].Trim()
        $pidStr = $parts[2].Trim()
        $rb = if ($parts[3].Trim() -match '^\d+$') { [int64]$parts[3].Trim() } else { 0 }
        $wb = if ($parts[4].Trim() -match '^\d+$') { [int64]$parts[4].Trim() } else { 0 }
        if ($name -and $pidStr -match '^\d+$') {
            $allProcs += @{N=$name; P=[int]$pidStr; R=$rb; W=$wb}
        }
    }
}
Write-Host "Step 2: wmic processes: $($allProcs.Count)"

# Step 3: Check how many have I/O > 0
$withIO = ($allProcs | Where-Object { $_.R -gt 0 -or $_.W -gt 0 }).Count
Write-Host "Step 3: Processes with I/O > 0: $withIO"

# Step 4: Check filtering
$filtered = @()
foreach ($proc in $allProcs) {
    if ($proc.R -eq 0 -and $proc.W -eq 0) { continue }
    $info = $procInfo[$proc.P]
    $onDrive = $false
    if ($info) {
        if ($info.NoPath -and $diskLetter -eq 'C') { $onDrive = $true }
        if ($info.Exe -and $info.Exe.StartsWith("${diskLetter}:")) { $onDrive = $true }
        if ($info.Drives -contains $diskLetter) { $onDrive = $true }
    }
    if ($onDrive) {
        $filtered += $proc
    }
}
Write-Host "Step 4: Filtered processes for ${diskLetter}: $($filtered.Count)"

# Show first 5
$filtered | Select-Object -First 5 | ForEach-Object {
    Write-Host "  $($_.N) PID=$($_.P) R=$($_.R) W=$($_.W)"
}
