# GrayReplays for TI-84 Plus CE

NQ / ES 1-minute bar replay backtester for the TI-84 Plus CE (a native C program).

## Files

| File | What it is |
|---|---|
| `GRAYRPLY.8xp` | the program (~35 KB) |
| `packs/W1012/*.8xv` | sample data pack: trading days Mon 2026-10-12 to Fri 2026-10-16 (NQ + ES, ~68 KB) |
| `grpack.py` | PC converter that makes more data packs |
| `src/main.c`, `makefile` | source (build with the CE C toolchain: `make`) |

## Requirements on the calculator

* **CE C libraries** (`clibs.8xg`: GRAPHX, FILEIOC, LibLoad). If Chess84 runs, you already have them.
  Otherwise get `clibs.8xg` from https://github.com/CE-Programming/libraries/releases and send it too.
* OS 5.5 and newer block C/assembly programs unless the calculator has arTIfiCE/Cesium set up.
  If Chess84 runs on your calculator, GrayReplays will run the same way.

## Sending to the calculator (TI Connect CE)

1. Connect the calculator by USB and open TI Connect CE.
2. Open **Calculator Explorer**, then drag `GRAYRPLY.8xp` and every `.8xv` file of a pack
   (`GH<tag>`, `GN<tag>0..`, `GE<tag>0..`) onto the calculator.
3. When asked, send the `.8xv` files to **Archive** (they are marked for archive already).
   The program can go to RAM or Archive.
4. Run it like Chess84 (from Cesium, or `Asm(prgmGRAYRPLY)` on older OS versions).

Free archive is about 3 MB; a one-week pack uses about 68 KB, so there is room for many weeks next to Chess84 and MINTI.

## Making more data packs (PC)

Needs Python 3 (no extra packages). Point `--data` at the GrayReplays desktop app's `data` folder.

```bash
python grpack.py --data "C:\path\to\GrayReplays\data" --list
```

```bash
python grpack.py --data "C:\path\to\GrayReplays\data" --from 2024-03-11 --to 2024-03-15 --tag MAR24
```

* `--from` / `--to` are trading days (New York). A day runs 18:00 the evening before to 17:00, so starting on a Monday includes the Sunday-evening open.
* `--days N` can be used instead of `--to`.
* `--tag` is 1-5 letters/digits and names the appvars (`GHMAR24`, `GNMAR240`, `GEMAR240`). It defaults to a code made from the start date.
* Output goes to `packs/<tag>/`. Up to about 16 weeks fit in one pack; a normal week is about 68 KB.
* Data comes from `data/hist/<SYM>/YYYY-MM.js` (2016-05 onward) plus the newer `NQ_1m.csv` / `ES_1m.csv`.

## Screen

* Top: symbol, timeframe, New York date/time of the newest candle, PLAY/PAUSE; then H/L/C of the current bar (split view: last NQ and ES prices).
* Chart: candles with a price axis; the yellow tag is the last price; dotted vertical lines mark each 18:00 session start.
  With a trade open: blue = entry, red = stop, green = target.
* Bottom: position with live P/L in $ and R (or the size the next order would get), then labels for the five keys under the screen.

## Keys

| Key | Action |
|---|---|
| right / left | step one bar of the current timeframe forward / back |
| `.` | step exactly one 1-minute candle |
| enter | play / pause (stops by itself when a stop or target fills) |
| up / down | play speed (1-5) |
| 1 2 3 4 | timeframe 1m / 5m / 15m / 1h (built from 1m candles as you go) |
| + / - | zoom in / out |
| 2nd | BUY at market (close of the current candle) |
| alpha | SELL at market |
| del | close the position at the current close |
| mode | in split view: send orders to NQ or ES (the `*` pane) |
| y= **VIEW** | NQ, ES, or split NQ+ES for SMT |
| window **JUMP** | next 18:00, 00:00, 02:00, 08:30, 09:30 or 13:30 NY open; 0 = start of pack |
| zoom **RISK** | stop and target in points (per symbol), $ risk per trade, full or micro contracts |
| trace **LOG** | trade list and stats: trades, win %, net $, total and average R, profit factor |
| graph **HELP** | key list |
| clear | save and go back to the title screen (clear there quits) |

## Trading rules

* Contracts = floor($ risk / (stop points x $ per point)). NQ $20/pt, MNQ $2, ES $50, MES $5. If one contract is more than the risk, the order is refused.
* The fill is the close of the newest candle. Stop and target are placed at entry -/+ the points you set.
* On every new 1-minute candle the **stop is checked before the target**. A gap through the stop fills at the candle's open.
* Pressing BUY while short (or SELL while long) closes the position. There is no reversing in one press.
* You cannot step back while a trade is open.
* R = points made / stop points. Defaults: NQ stop 20 / target 40, ES stop 5 / target 10, risk $500, full-size contracts.

The session (position, settings, trade log) is saved per pack in appvar `GS<tag>` when you press clear, and archived when the program exits. Opening the same pack again asks whether to resume.
