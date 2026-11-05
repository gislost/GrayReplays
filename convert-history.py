"""Convert <SYM>.parquet 1-minute candles into monthly JS chunks under data/hist.

Usage: python -I convert-history.py <parquet_folder>
Output: data/hist/<SYM>/<YYYY-MM>.js  ->  MD_CHUNK("SYM","YYYY-MM",[t,o,h,l,c,v,...]);
        data/hist/manifest.js (written last)
"""
import bisect
import calendar
import json
import os
import sys
import time

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

SYMBOLS = ["NQ", "ES"]
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "data", "hist")


def fmt_price(x):
    s = repr(x)
    return s[:-2] if s.endswith(".0") else s


def convert(sym, src):
    t = pq.read_table(src, columns=["ts", "open", "high", "low", "close", "volume"])
    t = t.take(pc.sort_indices(t, sort_keys=[("ts", "ascending")]))
    for name in t.column_names:
        if t[name].null_count:
            raise SystemExit(f"{sym}: nulls in {name}")
    secs = pc.divide(t["ts"].cast(pa.int64()), 1_000_000).to_pylist()
    cols = []
    for name in ["open", "high", "low", "close"]:
        q = pc.divide(pc.round(pc.multiply(t[name], 4.0)), 4.0)
        cols.append([fmt_price(v) for v in q.to_pylist()])
    vol = [str(int(round(v))) for v in t["volume"].to_pylist()]

    os.makedirs(os.path.join(OUT, sym), exist_ok=True)
    first, last = secs[0], secs[-1]
    g = time.gmtime(first)
    y, m = g.tm_year, g.tm_mon
    months = []
    while True:
        start = calendar.timegm((y, m, 1, 0, 0, 0))
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        end = calendar.timegm((ny, nm, 1, 0, 0, 0))
        if start > last:
            break
        i, j = bisect.bisect_left(secs, start), bisect.bisect_left(secs, end)
        if j > i:
            key = f"{y:04d}-{m:02d}"
            parts = []
            o, h, l, c = cols
            for k in range(i, j):
                parts.append(f"{secs[k]},{o[k]},{h[k]},{l[k]},{c[k]},{vol[k]}")
            body = f'MD_CHUNK("{sym}","{key}",[' + ",".join(parts) + "]);"
            with open(os.path.join(OUT, sym, key + ".js"), "w", encoding="ascii", newline="\n") as f:
                f.write(body)
            months.append(key)
        y, m = ny, nm
    print(f"{sym}: {len(secs)} rows, {len(months)} months", flush=True)
    return months, first, last


def main():
    src_dir = sys.argv[1]
    manifest = {}
    firsts, lasts = [], []
    for sym in SYMBOLS:
        months, f, l = convert(sym, os.path.join(src_dir, sym + ".parquet"))
        manifest[sym] = months
        firsts.append(f)
        lasts.append(l)
    manifest["first"] = min(firsts)
    manifest["last"] = max(lasts)
    tmp = os.path.join(OUT, "manifest.js.tmp")
    with open(tmp, "w", encoding="ascii", newline="\n") as f:
        f.write("window.MD_MANIFEST=" + json.dumps(manifest, separators=(",", ":")) + ";")
    os.replace(tmp, os.path.join(OUT, "manifest.js"))
    print("manifest written")


if __name__ == "__main__":
    main()
