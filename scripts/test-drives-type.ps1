# Debug: check Drives type and -contains behavior
$diskLetter = 'C'

$procInfo = @{}
Get-CimInstance Win32_Process -Property ProcessId,ExecutablePath,CommandLine | Where-Object {$_.ProcessId -gt 4} | ForEach-Object {
    $drives = @{}
    if ($_.ExecutablePath -and $_.ExecutablePath -match '^([A-Z]):') {
        $drives[$Matches[1]] = $true
    }
    $procInfo[$_.ProcessId] = @{Exe=$_.ExecutablePath; Drives=$drives.Keys; NoPath=(-not $_.ExecutablePath)}
}

# Check a specific process
$testPid = 0
foreach ($entry in $procInfo.GetEnumerator()) {
    if ($entry.Value.Exe -and $entry.Value.Exe.StartsWith('C:')) {
        $testPid = [int]$entry.Name
        break
    }
}

if ($testPid -gt 0) {
    $info = $procInfo[$testPid]
    Write-Host "Test PID: $testPid"
    Write-Host "Exe: $($info.Exe)"
    Write-Host "Drives type: $($info.Drives.GetType())"
    Write-Host "Drives: $($info.Drives)"
    Write-Host "Drives -contains C: $($info.Drives -contains 'C')"
    Write-Host "Drives -contains 'C': $($info.Drives -contains 'C')"

    # The issue might be that $drives.Keys returns a KeyCollection, not an array
    # -contains might not work with KeyCollection
    $drivesArray = @($info.Drives)
    Write-Host "DrivesArray type: $($drivesArray.GetType())"
    Write-Host "DrivesArray -contains C: $($drivesArray -contains 'C')"
}
