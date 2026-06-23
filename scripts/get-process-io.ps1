# 使用 wmic 获取进程 I/O 数据
$lines = wmic process get Name,ProcessId,ReadOperationCount,WriteOperationCount,ReadTransferBytes,WriteTransferBytes /format:csv 2>$null
$result = @()
$first = $true
foreach ($line in $lines) {
    if ($first) { $first = $false; continue }
    $line = $line.Trim()
    if ($line -eq '') { continue }
    $parts = $line -split ','
    if ($parts.Length -ge 6) {
        $name = $parts[1]
        $pid = [int]$parts[2]
        $rc = if ($parts[3] -match '^\d+$') { [int64]$parts[3] } else { 0 }
        $wc = if ($parts[4] -match '^\d+$') { [int64]$parts[4] } else { 0 }
        $rb = if ($parts[5] -match '^\d+$') { [int64]$parts[5] } else { 0 }
        $wb = if ($parts.Length -ge 7 -and $parts[6] -match '^\d+$') { [int64]$parts[6] } else { 0 }
        if ($name -and $pid -gt 4) {
            $result += @{Name=$name; Id=$pid; RB=$rb; WB=$wb}
        }
    }
}
$result | ConvertTo-Json -Depth 1
