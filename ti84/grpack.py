"""GrayReplays TI-84 Plus CE data packer.

Packs 1-minute NQ and ES candles for a range of trading days into TI-84 Plus CE
AppVars (.8xv) that GRAYRPLY reads straight from archive.

Usage:
  python grpack.py --data <GrayReplays data folder> --from 2026-10-05 --to 2026-10-09
  python grpack.py --data <folder> --from 2024-03-11 --days 5 --tag MAR24
  python grpack.py --data <folder> --list          (show available months)

A trading day D covers 18:00 New York on the previous day to 17:00 on D, so
--from Monday includes the Sunday-evening open.

Output (in --out, default ./packs/<tag>):
  GH<tag>.8xv          header: date range, time segments, price bases
  GN<tag><k>.8xv       NQ candle data, part k (each part < 60 KB)
  GE<tag><k>.8xv       ES candle data, part k
Send all of them to the calculator (Archive).

Encoding: one shared minute timeline for NQ and ES (a minute missing on one
symbol is filled with a flat candle at its previous close).  Each candle is
5 bytes: open (u16 ticks above the pack's lowest low), high-open, open-low,
close-low (u8 ticks each).  Candles with a range over 254 ticks go to a small
overflow table with full values.  Volume is not stored.  About 35 KB per
symbol per week.
"""
import argparse
import calendar
import csv
import datetime as dt
import os
import re
import struct
import sys

PART_BYTES = 60000
REC = 5
SYMS = ["NQ", "ES"]


# ---------- New York time (US DST rules since 2007; data starts 2016) ----------
def _nth_sunday(y, m, n):
    d = dt.date(y, m, 1)
    first = d + dt.timedelta(days=(6 - d.weekday()) % 7)
    return first + dt.timedelta(days=7 * (n - 1))


def ny_offset_min(t):
    """UTC offset of New York in minutes (-240 EDT / -300 EST) at unix time t."""
    y = time_gm(t).year
    # DST starts 2nd Sunday of March 02:00 EST (=07:00 UTC), ends 1st Sunday Nov 02:00 EDT (=06:00 UTC)
    s = _nth_sunday(y, 3, 2)
    e = _nth_sunday(y, 11, 1)
    start = calendar.timegm((s.year, s.month, s.day, 7, 0, 0))
    end = calendar.timegm((e.year, e.month, e.day, 6, 0, 0))
    return -240 if start <= t < end else -300


def time_gm(t):
    return dt.datetime(1970, 1, 1) + dt.timedelta(seconds=t)


def ny_to_unix(d, hh, mm):
    """Unix time of NY wall-clock d hh:mm (d a date)."""
    guess = calendar.timegm((d.year, d.month, d.day, hh, mm, 0)) + 300 * 60
    off = ny_offset_min(guess)
    t = calendar.timegm((d.year, d.month, d.day, hh, mm, 0)) - off * 60
    return t


# ---------- loading ----------
def load_month_js(path):
    with open(path, "r", encoding="ascii") as f:
        s = f.read()
    a, b = s.index("["), s.rindex("]")
    vals = s[a + 1:b].split(",")
    out = {}
    for k in range(0, len(vals) - 5, 6):
        t = int(vals[k])
        out[t] = tuple(int(round(float(v) * 4)) for v in vals[k + 1:k + 5])
    return out


def load_csv(path):
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.reader(f)
        next(r, None)
        for row in r:
            if len(row) < 6:
                continue
            t = int(row[0])
            out[t] = tuple(int(round(float(v) * 4)) for v in row[2:6])
    return out


def months_between(t0, t1):
    g0, g1 = time_gm(t0), time_gm(t1)
    y, m = g0.year, g0.month
    res = []
    while (y, m) <= (g1.year, g1.month):
        res.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return res


def load_symbol(data_dir, sym, t0, t1):
    bars = {}
    for key in months_between(t0, t1):
        p = os.path.join(data_dir, "hist", sym, key + ".js")
        if os.path.exists(p):
            bars.update(load_month_js(p))
    # recent CSV (last ~30 days) overrides / extends the monthly history
    bars.update(load_csv(os.path.join(data_dir, f"{sym}_1m.csv")))
    return {t: v for t, v in bars.items() if t0 <= t < t1}


# ---------- .8xv writer ----------
def write_8xv(path, name, payload, archived=True):
    if len(payload) > 65500:
        raise SystemExit(f"{name}: payload too big ({len(payload)})")
    nm = name.encode("ascii").ljust(8, b"\0")
    vdata = struct.pack("<H", len(payload)) + payload
    entry = struct.pack("<HHB", 0x0D, len(vdata), 0x15) + nm + bytes([0, 0x80 if archived else 0]) \
        + struct.pack("<H", len(vdata)) + vdata
    comment = b"GrayReplays data".ljust(42, b"\0")
    hdr = b"**TI83F*\x1a\x0a\x00" + comment + struct.pack("<H", len(entry))
    csum = sum(entry) & 0xFFFF
    with open(path, "wb") as f:
        f.write(hdr + entry + struct.pack("<H", csum))


def u24(v):
    assert 0 <= v < 1 << 24, v
    return struct.pack("<I", v)[:3]


# ---------- packing ----------
def build(data_dir, d_from, d_to, tag, out_dir):
    t0 = ny_to_unix(d_from - dt.timedelta(days=1), 18, 0)
    t1 = ny_to_unix(d_to, 17, 0)
    raw = {s: load_symbol(data_dir, s, t0, t1) for s in SYMS}
    for s in SYMS:
        if not raw[s]:
            raise SystemExit(f"No {s} data between {d_from} and {d_to}")
    times = sorted(set(raw["NQ"]) | set(raw["ES"]))
    n = len(times)

    series = {}
    for s in SYMS:
        src = raw[s]
        first = src[min(src)]
        prev_c = first[0]
        arr = []
        for t in times:
            v = src.get(t)
            if v is None:
                v = (prev_c, prev_c, prev_c, prev_c)
            arr.append(v)
            prev_c = v[3]
        series[s] = arr

    # time segments: runs of consecutive minutes with a constant NY offset
    segs = []
    for i, t in enumerate(times):
        off = ny_offset_min(t)
        if i == 0 or t != times[i - 1] + 60 or off != segs[-1][2]:
            segs.append((i, t // 60, off))

    bases = {}
    for s in SYMS:
        lo = min(v[2] for v in series[s])
        hi = max(v[1] for v in series[s])
        if hi - lo > 65535:
            raise SystemExit(f"{s}: price range too wide for one pack; use fewer days")
        bases[s] = lo

    # data parts
    per_part = 11500
    while True:
        ok = True
        parts = {}
        for s in SYMS:
            b = bases[s]
            plist = []
            for p0 in range(0, n, per_part):
                recs, ovf = bytearray(), bytearray()
                novf = 0
                for li, (o, h, l, c) in enumerate(series[s][p0:p0 + per_part]):
                    o, h, l, c = o - b, h - b, l - b, c - b
                    a1, a2, a3 = h - o, o - l, c - l
                    if a1 > 254 or a2 > 254 or a3 > 254:
                        recs += struct.pack("<HBBB", o, 255, 255, 255)
                        ovf += struct.pack("<HHHHH", li, o, h, l, c)
                        novf += 1
                    else:
                        recs += struct.pack("<HBBB", o, a1, a2, a3)
                cnt = len(recs) // REC
                body = b"GRDT" + bytes([SYMS.index(s), len(plist)]) + u24(cnt) + struct.pack("<H", novf) + recs + ovf
                if len(body) > PART_BYTES:
                    ok = False
                plist.append(body)
            parts[s] = plist
        if ok:
            break
        per_part -= 500
    nparts = len(parts["NQ"])
    if nparts > 10:
        raise SystemExit("Too many days for one pack (max ~16 weeks). Use a shorter range.")

    label = f"{d_from:%m/%d/%y}-{d_to:%m/%d/%y}".encode("ascii")[:23].ljust(24, b"\0")
    hdr = bytearray(b"GRPK" + bytes([1]) + tag.encode("ascii").ljust(6, b"\0"))
    hdr += u24(n) + bytes([nparts]) + u24(per_part) + u24(bases["NQ"]) + u24(bases["ES"])
    hdr += struct.pack("<H", len(segs)) + label
    for i, m, off in segs:
        hdr += u24(i) + struct.pack("<Ih", m, off)
    if len(hdr) > PART_BYTES:
        raise SystemExit("Header too big (too many time gaps); use fewer days")

    os.makedirs(out_dir, exist_ok=True)
    files = []
    write_8xv(os.path.join(out_dir, f"GH{tag}.8xv"), f"GH{tag}", bytes(hdr))
    files.append((f"GH{tag}", len(hdr)))
    for s, letter in (("NQ", "N"), ("ES", "E")):
        for k, body in enumerate(parts[s]):
            nm = f"G{letter}{tag}{k}"
            write_8xv(os.path.join(out_dir, nm + ".8xv"), nm, body)
            files.append((nm, len(body)))
    total = sum(sz for _, sz in files)
    print(f"Pack {tag}: {d_from} .. {d_to}, {n} one-minute candles per symbol, "
          f"{len(segs)} time segments, {nparts} part(s) per symbol")
    for nm, sz in files:
        print(f"  {nm:<9} {sz:>6} bytes")
    print(f"  total     {total:>6} bytes ({total / 1024:.1f} KB of archive)")
    print(f"Wrote to {out_dir}")
    return times, series, segs, bases, per_part


def main():
    ap = argparse.ArgumentParser(description="Pack NQ/ES 1m candles for GrayReplays on TI-84 Plus CE")
    ap.add_argument("--data", required=True, help="GrayReplays data folder (contains NQ_1m.csv and hist/)")
    ap.add_argument("--from", dest="d_from", help="first trading day YYYY-MM-DD")
    ap.add_argument("--to", dest="d_to", help="last trading day YYYY-MM-DD")
    ap.add_argument("--days", type=int, help="number of calendar days from --from (instead of --to)")
    ap.add_argument("--tag", help="1-5 letters/digits naming the pack (default: from the start date)")
    ap.add_argument("--out", help="output folder (default ./packs/<tag>)")
    ap.add_argument("--list", action="store_true", help="list available months and exit")
    a = ap.parse_args()

    if a.list:
        for s in SYMS:
            hd = os.path.join(a.data, "hist", s)
            ms = sorted(f[:-3] for f in os.listdir(hd)) if os.path.isdir(hd) else []
            csvb = load_csv(os.path.join(a.data, f"{s}_1m.csv"))
            rng = f", CSV {time_gm(min(csvb)):%Y-%m-%d}..{time_gm(max(csvb)):%Y-%m-%d}" if csvb else ""
            print(f"{s}: months {ms[0] if ms else '-'} .. {ms[-1] if ms else '-'} ({len(ms)}){rng}")
        return
    if not a.d_from or not (a.d_to or a.days):
        ap.error("need --from and --to (or --days)")
    d_from = dt.date.fromisoformat(a.d_from)
    d_to = dt.date.fromisoformat(a.d_to) if a.d_to else d_from + dt.timedelta(days=a.days - 1)
    if d_to < d_from:
        ap.error("--to is before --from")
    tag = (a.tag or f"{d_from:%y%m%d}"[1:]).upper()
    if not re.fullmatch(r"[A-Z0-9]{1,5}", tag):
        ap.error("--tag must be 1-5 letters/digits")
    out = a.out or os.path.join(os.getcwd(), "packs", tag)
    build(a.data, d_from, d_to, tag, out)


if __name__ == "__main__":
    main()
