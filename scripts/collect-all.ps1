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

# Process drive mapping: determine which drives each process is likely using
# Signals: ExecutablePath, CommandLine references
# System processes (no exe path) mostly operate on C: (system dirs), show only on C:
# NOTE: Use string keys for PID to avoid uint32/int32 type mismatch with wmic
$procInfo = @{}
Get-CimInstance Win32_Process -Property ProcessId,ExecutablePath,CommandLine | Where-Object {$_.ProcessId -gt 4} | ForEach-Object {
    $drives = @{}
    if ($_.ExecutablePath -and $_.ExecutablePath -match '^([A-Z]):') {
        $drives[$Matches[1]] = $true
    }
    if ($_.CommandLine) {
        foreach ($m in [regex]::Matches($_.CommandLine, '([A-Z]):\\')) {
            $drives[$m.Groups[1].Value] = $true
        }
    }
    $key = "$($_.ProcessId)"
    $procInfo[$key] = @{Exe=$_.ExecutablePath; Drives=@($drives.Keys); NoPath=(-not $_.ExecutablePath)}
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
            $lookupKey = "$procId"
            $info = $procInfo[$lookupKey]
            $onDrive = $false
            if ($info) {
                # System processes without exe path: only show on C: (they operate on C:\\Windows)
                if ($info.NoPath -and 'C' -eq 'C') { $onDrive = $true }
                # Exe on the target drive
                if ($info.Exe -and $info.Exe.StartsWith('C:')) { $onDrive = $true }
                # CommandLine references the target drive
                if ($info.Drives -contains 'C') { $onDrive = $true }
            }
            if ($onDrive) {
                $procs += @{N=$name; P=$procId; R=$rb; W=$wb}
            }
        }
    }
}
$result.Procs = $procs

$result | ConvertTo-Json -Depth 3 -Compress