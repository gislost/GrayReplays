# GrayReplays

Bar-replay backtester for NQ and ES futures (1-minute candles).

* **Desktop app:** open `index.html` in a browser. Candle data goes in `data/`. That folder is not in the repo: run `fetch-data.ps1` to download the last ~30 days, and use `convert-history.py` for older history.
* **TI-84 Plus CE version:** see [`ti84/README.md`](ti84/README.md). It includes the program (`ti84/bin/GRAYRPLY.8xp`), a sample week of data (`ti84/packs/W1012`), and the `grpack.py` converter.

Charts use [Lightweight Charts](https://github.com/tradingview/lightweight-charts) (Apache-2.0).
