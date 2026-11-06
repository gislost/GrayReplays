#!/usr/bin/env python3
"""
Make the red-folder news appvar GW<tag> for a GrayReplays TI-84 pack.

News source: ../news/ff_usd_red.json  (USD high-impact events from the
ForexFactory calendar, {"names": [...], "ev": [[unix_seconds, name_index], ...]}).

Appvar layout:
  "GRNW" u8 version(1) u16 count
  count x { u32 unix_minute, char label[20] (zero padded) }   sorted by time
Events at the same minute are merged into one label ("CPI+Core CPI" -> "CPI +3").

  python grnews.py --tag JUL20 --from 2026-07-20 --to 2026-08-21
"""
import argparse, datetime as dt, json, os, struct, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grpack import write_8xv, ny_to_unix  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_NEWS = os.path.join(HERE, "..", "news", "ff_usd_red.json")
LABEL = 20

# short names, most important first (the first one in a minute names the group)
SHORT = [
    ("Non-Farm Employment Change", "NFP"),
    ("Federal Funds Rate", "FOMC Rate"),
    ("FOMC Statement", "FOMC Statement"),
    ("FOMC Press Conference", "FOMC Presser"),
    ("FOMC Economic Projections", "FOMC Projections"),
    ("FOMC Meeting Minutes", "FOMC Minutes"),
    ("Core CPI m/m", "CPI"),
    ("CPI m/m", "CPI"),
    ("CPI y/y", "CPI"),
    ("Core CPI y/y", "CPI"),
    ("Core PPI m/m", "PPI"),
    ("PPI m/m", "PPI"),
    ("Core PCE Price Index m/m", "Core PCE"),
    ("Advance GDP q/q", "GDP Advance"),
    ("Prelim GDP q/q", "GDP Prelim"),
    ("Final GDP q/q", "GDP Final"),
    ("Core Retail Sales m/m", "Retail Sales"),
    ("Retail Sales m/m", "Retail Sales"),
    ("ISM Manufacturing PMI", "ISM Mfg PMI"),
    ("ISM Services PMI", "ISM Services PMI"),
    ("JOLTS Job Openings", "JOLTS"),
    ("ADP Non-Farm Employment Change", "ADP Jobs"),
    ("ADP Weekly Employment Change", "ADP Weekly"),
    ("Unemployment Claims", "Jobless Claims"),
    ("Unemployment Rate", "Unemployment"),
    ("Average Hourly Earnings m/m", "Avg Hourly Earn"),
    ("Employment Cost Index q/q", "ECI"),
    ("Prelim UoM Consumer Sentiment", "UoM Sentiment"),
    ("Revised UoM Consumer Sentiment", "UoM Sentiment"),
    ("Prelim UoM Inflation Expectations", "UoM Infl Exp"),
    ("CB Consumer Confidence", "CB Confidence"),
    ("Core Durable Goods Orders m/m", "Durable Goods"),
    ("Durable Goods Orders m/m", "Durable Goods"),
    ("Philly Fed Manufacturing Index", "Philly Fed"),
    ("Empire State Manufacturing Index", "Empire State"),
    ("Crude Oil Inventories", "Crude Oil Inv"),
    ("Flash Manufacturing PMI", "Flash Mfg PMI"),
    ("Flash Services PMI", "Flash Svc PMI"),
    ("Final Manufacturing PMI", "Final Mfg PMI"),
    ("Prelim Benchmark Payrolls Revision", "Payrolls Revision"),
]
RANK = {n: i for i, (n, _) in enumerate(SHORT)}
SHORTN = dict(SHORT)


def short(name):
    if name in SHORTN:
        return SHORTN[name]
    for a, b in (("Fed Chairman ", ""), ("Fed Chair ", ""), ("FOMC Member ", ""), ("Treasury Sec ", "Treas "),
                 ("President ", "Pres "), (" Speaks", " speaks"), (" Testifies", " testifies")):
        name = name.replace(a, b)
    return name


def load_events(path, t0, t1):
    d = json.load(open(path))
    names = d["names"]
    by_min = {}
    for ts, ix in d["ev"]:
        if t0 <= ts < t1:
            by_min.setdefault(ts // 60, []).append(names[ix])
    out = []
    for m in sorted(by_min):
        evs = sorted(set(by_min[m]), key=lambda n: RANK.get(n, 999))
        labels = []
        for n in evs:
            s = short(n)
            if s not in labels:
                labels.append(s)
        lab = labels[0]
        if len(labels) > 1:
            lab = f"{lab} +{len(labels) - 1}"
        out.append((m, lab[:LABEL - 1], evs))
    return out


def build_news(tag, d_from, d_to, out_dir, news_path=DEFAULT_NEWS, verbose=True):
    if not os.path.exists(news_path):
        if verbose:
            print(f"(no news file at {news_path}; skipping GW{tag})")
        return None
    t0 = ny_to_unix(d_from - dt.timedelta(days=1), 18, 0)
    t1 = ny_to_unix(d_to, 17, 0)
    evs = load_events(news_path, t0, t1)
    body = bytearray(b"GRNW" + bytes([1]) + struct.pack("<H", len(evs)))
    for m, lab, _ in evs:
        body += struct.pack("<I", m) + lab.encode("ascii", "replace").ljust(LABEL, b"\0")
    os.makedirs(out_dir, exist_ok=True)
    nm = f"GW{tag}"
    write_8xv(os.path.join(out_dir, nm + ".8xv"), nm, bytes(body))
    if verbose:
        print(f"News {nm}: {len(evs)} red-folder times, {len(body)} bytes")
        for m, lab, raw in evs:
            t = dt.datetime.fromtimestamp(m * 60, dt.timezone.utc) - dt.timedelta(hours=4)
            print(f"  {t:%a %m/%d %H:%M} (approx NY)  {lab:<20} {', '.join(raw)}")
    return nm


def main():
    ap = argparse.ArgumentParser(description="Red-folder news appvar for a GrayReplays TI-84 pack")
    ap.add_argument("--tag", required=True)
    ap.add_argument("--from", dest="d_from", required=True)
    ap.add_argument("--to", dest="d_to", required=True)
    ap.add_argument("--news", default=DEFAULT_NEWS)
    ap.add_argument("--out", help="output folder (default ./packs/<tag>)")
    a = ap.parse_args()
    tag = a.tag.upper()
    out = a.out or os.path.join(os.getcwd(), "packs", tag)
    build_news(tag, dt.date.fromisoformat(a.d_from), dt.date.fromisoformat(a.d_to), out, a.news)


if __name__ == "__main__":
    main()
