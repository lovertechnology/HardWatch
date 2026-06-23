$map = @{}
$physDisks = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk
foreach ($pd in $physDisks) {
    $name = $pd.Name
    if ($name -eq '_Total') { continue }
    $parts = $name -split ' '
    foreach ($part in $parts) {
        if ($part -match '^([A-Z]):$') {
            $letter = $Matches[1]
            $map[$letter] = $name
        }
    }
}
$map | ConvertTo-Json