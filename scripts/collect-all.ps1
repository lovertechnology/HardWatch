$result = @{}

# Disk I/O rate via Get-Counter (more reliable than Win32_PerfFormattedData)
$readCounter = '\PhysicalDisk(2 C: D:)\Disk Read Bytes/sec'
$writeCounter = '\PhysicalDisk(2 C: D:)\Disk Write Bytes/sec'
try {
    $samples = Get-Counter -Counter $readCounter, $writeCounter -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop
    foreach ($cs in $samples.CounterSamples) {
        if ($cs.Path -match 'Read') { $result.DiskReadBytesPersec = $cs.CookedValue }
        if ($cs.Path -match 'Write') { $result.DiskWriteBytesPersec = $cs.CookedValue }
    }
} catch {
    $result.DiskReadBytesPersec = 0
    $result.DiskWriteBytesPersec = 0
}

# Process executable path mapping (PID -> path)
$paths = @{}
Get-CimInstance Win32_Process -Property ProcessId,ExecutablePath | Where-Object {$_.ProcessId -gt 4} | ForEach-Object {
    if ($_.ExecutablePath) { $paths[$_.ProcessId] = $_.ExecutablePath }
}

# Process I/O cumulative counters (CSV format)
$lines = wmic process where "ProcessId>4" get Name,ProcessId,ReadTransferCount,WriteTransferCount /format:csv 2>$null
$procs = @()
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
        if ($name -and $pidStr -match '^\d+$' -and ($rb -gt 0 -or $wb -gt 0)) {
            $procId = [int]$pidStr
            $exePath = $paths[$procId]
            $onDrive = $false
            if ($exePath -and $exePath.StartsWith('C:')) { $onDrive = $true }
            if (-not $exePath) { $onDrive = $true }
            if ($onDrive) {
                $procs += @{N=$name; P=$procId; R=$rb; W=$wb}
            }
        }
    }
}
$result.Procs = $procs

$result | ConvertTo-Json -Depth 3 -Compress