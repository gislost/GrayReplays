# Downloads the last ~30 days of 1-minute NQ and ES futures candles from Yahoo Finance
# and merges them into data\NQ_1m.csv and data\ES_1m.csv.
# Run it again every few weeks: new candles are added and old ones are kept,
# so the history grows past Yahoo's 30-day limit.
#
# CSV columns: time (Unix seconds, UTC), ny_time (New York time), open, high, low, close, volume

$ErrorActionPreference = 'Stop'
$dataDir = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Force $dataDir | Out-Null

$ny = [TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')
$inv = [Globalization.CultureInfo]::InvariantCulture

foreach ($sym in @('NQ', 'ES')) {
    $file = Join-Path $dataDir "${sym}_1m.csv"
    $bars = @{}

    # Keep candles from earlier runs
    if (Test-Path $file) {
        Import-Csv $file | ForEach-Object { $bars[[long]$_.time] = $_ }
    }
    $before = $bars.Count

    # Yahoo serves 1-minute data for the last 30 days, at most 7 days per request
    $end = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $start = $end - 29 * 86400
    for ($p1 = $start; $p1 -lt $end; $p1 += 7 * 86400) {
        $p2 = [Math]::Min($p1 + 7 * 86400, $end)
        $url = "https://query1.finance.yahoo.com/v8/finance/chart/$sym=F?interval=1m&period1=$p1&period2=$p2"
        $r = Invoke-RestMethod $url -UserAgent 'Mozilla/5.0' -UseBasicParsing
        $res = $r.chart.result[0]
        if (-not $res.timestamp) { continue }
        $q = $res.indicators.quote[0]
        for ($i = 0; $i -lt $res.timestamp.Count; $i++) {
            # Skip empty minutes Yahoo pads with nulls
            if ($null -eq $q.open[$i] -or $null -eq $q.close[$i]) { continue }
            $t = [long]$res.timestamp[$i]
            # Yahoo zeroes the volume on its oldest minutes, so don't let that overwrite a saved candle
            if ([long]$q.volume[$i] -eq 0 -and $bars.ContainsKey($t) -and [long]$bars[$t].volume -gt 0) { continue }
            $nyTime = [TimeZoneInfo]::ConvertTimeFromUtc([DateTimeOffset]::FromUnixTimeSeconds($t).UtcDateTime, $ny)
            $bars[$t] = [pscustomobject]@{
                time    = $t
                ny_time = $nyTime.ToString('yyyy-MM-dd HH:mm', $inv)
                open    = ([double]$q.open[$i]).ToString($inv)
                high    = ([double]$q.high[$i]).ToString($inv)
                low     = ([double]$q.low[$i]).ToString($inv)
                close   = ([double]$q.close[$i]).ToString($inv)
                volume  = [long]$q.volume[$i]
            }
        }
    }

    # Yahoo appends the live price with an off-minute timestamp, and the newest
    # minute is still forming, so drop both
    @($bars.Keys) | Where-Object { $_ % 60 -ne 0 -or $_ -gt $end - 120 } | ForEach-Object { $bars.Remove($_) }

    $bars.Keys | Sort-Object | ForEach-Object { $bars[$_] } |
        Select-Object time, ny_time, open, high, low, close, volume |
        Export-Csv $file -NoTypeInformation -Encoding UTF8

    $sorted = $bars.Keys | Sort-Object
    "{0}: {1} candles ({2} new), {3} to {4} NY time" -f $sym, $bars.Count, ($bars.Count - $before),
        $bars[$sorted[0]].ny_time, $bars[$sorted[-1]].ny_time
}

# The app opens straight from disk, where browsers block reading CSVs,
# so also write the candles as a script file it can load: [time, open, high, low, close, volume]
$sb = [Text.StringBuilder]::new('window.MARKET_DATA = {')
foreach ($sym in @('NQ', 'ES')) {
    [void]$sb.Append("`n`"$sym`": [")
    $first = $true
    foreach ($row in Import-Csv (Join-Path $dataDir "${sym}_1m.csv")) {
        if (-not $first) { [void]$sb.Append(',') }
        $first = $false
        [void]$sb.Append("[$($row.time),$($row.open),$($row.high),$($row.low),$($row.close),$($row.volume)]")
    }
    [void]$sb.Append('],')
}
[void]$sb.Append("`n};`n")
[IO.File]::WriteAllText((Join-Path $dataDir 'data.js'), $sb.ToString())
"Wrote data\data.js for the app"
