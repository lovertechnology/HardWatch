Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk |
  Where-Object {$_.Name -like '*C:*'} |
  Select-Object DiskReadBytesPersec,DiskWriteBytesPersec |
  ConvertTo-Json