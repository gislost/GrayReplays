/*
 * GrayReplays for TI-84 Plus CE
 * NQ / ES 1-minute bar replay backtester.
 * Data packs (GH<tag>, GN<tag><k>, GE<tag><k>) are made on the PC with grpack.py.
 */
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdio.h>
#include <time.h>
#include <graphx.h>
#include <fileioc.h>
#include <ti/getcsc.h>

/* ------------------------------------------------------------------ colors */
enum { C_BG = 0, C_GRID, C_TEXT, C_UP, C_DN, C_DIM, C_BLUE, C_YEL, C_WHITE, C_BAR, C_ORG, C_DAY, C_SEL, C_BLACK };

static void set_palette(void)
{
    gfx_palette[C_BG]    = gfx_RGBTo1555(19, 23, 34);
    gfx_palette[C_GRID]  = gfx_RGBTo1555(38, 42, 54);
    gfx_palette[C_TEXT]  = gfx_RGBTo1555(209, 212, 220);
    gfx_palette[C_UP]    = gfx_RGBTo1555(38, 166, 154);
    gfx_palette[C_DN]    = gfx_RGBTo1555(239, 83, 80);
    gfx_palette[C_DIM]   = gfx_RGBTo1555(120, 123, 134);
    gfx_palette[C_BLUE]  = gfx_RGBTo1555(66, 133, 255);
    gfx_palette[C_YEL]   = gfx_RGBTo1555(247, 201, 72);
    gfx_palette[C_WHITE] = gfx_RGBTo1555(255, 255, 255);
    gfx_palette[C_BAR]   = gfx_RGBTo1555(30, 34, 45);
    gfx_palette[C_ORG]   = gfx_RGBTo1555(255, 152, 0);
    gfx_palette[C_DAY]   = gfx_RGBTo1555(70, 74, 92);
    gfx_palette[C_SEL]   = gfx_RGBTo1555(50, 70, 120);
    gfx_palette[C_BLACK] = gfx_RGBTo1555(0, 0, 0);
}

/* ------------------------------------------------------------------ helpers */
static uint16_t rd16(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }
static uint24_t rd24(const uint8_t *p) { return (uint24_t)p[0] | ((uint24_t)p[1] << 8) | ((uint24_t)p[2] << 16); }
static uint32_t rd32(const uint8_t *p) { return (uint32_t)rd24(p) | ((uint32_t)p[3] << 24); }

static void text(const char *s, int x, int y, uint8_t col)
{
    gfx_SetTextFGColor(col);
    gfx_PrintStringXY(s, x, y);
}

static void text_c(const char *s, int y, uint8_t col)
{
    text(s, (320 - (int)gfx_GetStringWidth(s)) / 2, y, col);
}

/* ------------------------------------------------------------------ pack */
#define MAXPART 10
static const uint8_t *hdr;
static uint24_t N;
static uint8_t nparts;
static uint24_t perpart;
static int base[2];
static uint16_t nseg;
static const uint8_t *segs;
static const uint8_t *part[2][MAXPART];
static char tag[7];
static char label[25];
static const char *SYM[2] = { "NQ", "ES" };

#define SEG_IDX(s) rd24(segs + (uint24_t)(s) * 9)
#define SEG_MIN(s) rd32(segs + (uint24_t)(s) * 9 + 3)
#define SEG_OFF(s) ((int16_t)rd16(segs + (uint24_t)(s) * 9 + 7))

static uint16_t segc;

static uint16_t seg_of(uint24_t i)
{
    uint16_t lo, hi;
    if (segc < nseg && SEG_IDX(segc) <= i && (segc + 1 >= nseg || SEG_IDX(segc + 1) > i))
        return segc;
    if (segc + 1 < nseg && SEG_IDX(segc + 1) <= i && (segc + 2 >= nseg || SEG_IDX(segc + 2) > i))
        return ++segc;
    lo = 0; hi = nseg - 1;
    while (lo < hi) {
        uint16_t mid = (uint16_t)((lo + hi + 1) / 2);
        if (SEG_IDX(mid) <= i) lo = mid; else hi = mid - 1;
    }
    return segc = lo;
}

/* unix minutes of candle i */
static uint32_t umin(uint24_t i)
{
    uint16_t s = seg_of(i);
    return SEG_MIN(s) + (i - SEG_IDX(s));
}

/* New York local minutes since 1970 of candle i */
static uint32_t lmin(uint24_t i)
{
    uint16_t s = seg_of(i);
    return (uint32_t)((int32_t)(SEG_MIN(s) + (i - SEG_IDX(s))) + SEG_OFF(s));
}

typedef struct { int o, h, l, c; } candle_t;

static void rd_candle(uint8_t s, uint24_t i, candle_t *k)
{
    uint8_t p = (uint8_t)(i / perpart);
    uint16_t li = (uint16_t)(i - (uint24_t)p * perpart);
    const uint8_t *d = part[s][p];
    const uint8_t *r = d + 11 + (uint24_t)li * 5;
    int o = rd16(r);
    if (r[2] == 255 && r[3] == 255 && r[4] == 255) {
        uint24_t cnt = rd24(d + 6);
        uint16_t lo = 0, hi = rd16(d + 9);
        const uint8_t *ov = d + 11 + cnt * 5;
        while (lo < hi) {
            uint16_t mid = (uint16_t)((lo + hi) / 2);
            uint16_t v = rd16(ov + (uint24_t)mid * 10);
            if (v == li) {
                const uint8_t *e = ov + (uint24_t)mid * 10;
                k->o = rd16(e + 2) + base[s];
                k->h = rd16(e + 4) + base[s];
                k->l = rd16(e + 6) + base[s];
                k->c = rd16(e + 8) + base[s];
                return;
            }
            if (v < li) lo = mid + 1; else hi = mid;
        }
    }
    k->o = o + base[s];
    k->h = o + r[2] + base[s];
    k->l = o - r[3] + base[s];
    k->c = k->l + r[4];
}

static const uint8_t *open_ptr(const char *name)
{
    uint8_t h = ti_Open(name, "r");
    const uint8_t *p;
    if (!h) return NULL;
    p = ti_GetDataPtr(h);
    ti_Close(h);
    return p;
}

static char errmsg[40];

static bool load_pack(const char *hname)
{
    char nm[9];
    uint8_t s, k;
    hdr = open_ptr(hname);
    if (!hdr || memcmp(hdr, "GRPK", 4) || hdr[4] != 1) { strcpy(errmsg, "Bad header"); return false; }
    memcpy(tag, hdr + 5, 6); tag[6] = 0;
    N = rd24(hdr + 11);
    nparts = hdr[14];
    perpart = rd24(hdr + 15);
    base[0] = (int)rd24(hdr + 18);
    base[1] = (int)rd24(hdr + 21);
    nseg = rd16(hdr + 24);
    memcpy(label, hdr + 26, 24); label[24] = 0;
    segs = hdr + 50;
    segc = 0;
    if (nparts > MAXPART || N < 2) { strcpy(errmsg, "Bad header"); return false; }
    for (s = 0; s < 2; s++)
        for (k = 0; k < nparts; k++) {
            sprintf(nm, "G%c%s%u", s ? 'E' : 'N', tag, k);
            part[s][k] = open_ptr(nm);
            if (!part[s][k] || memcmp(part[s][k], "GRDT", 4)) {
                sprintf(errmsg, "Missing appvar %s", nm);
                return false;
            }
        }
    return true;
}

/* ------------------------------------------------------------------ date/time */
static const char *WDAY[7] = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };

/* "Tue 10/13 09:31" from local minutes */
static void fmt_time(char *out, uint32_t lm)
{
    int32_t days = (int32_t)(lm / 1440);
    int mins = (int)(lm % 1440);
    int32_t z = days + 719468;
    int32_t era = z / 146097;
    int32_t doe = z - era * 146097;
    int32_t yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    int32_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    int32_t mp = (5 * doy + 2) / 153;
    int d = (int)(doy - (153 * mp + 2) / 5 + 1);
    int m = (int)(mp < 10 ? mp + 3 : mp - 9);
    sprintf(out, "%s %02d/%02d %02d:%02d", WDAY[(days + 4) % 7], m, d, mins / 60, mins % 60);
}

/* ------------------------------------------------------------------ number formatting */
static void fmt_price(char *out, int t)
{
    sprintf(out, "%d.%02d", t >> 2, (t & 3) * 25);
}

/* points from ticks, signed, ".00" dropped when whole */
static void fmt_pts(char *out, int t)
{
    int a = t < 0 ? -t : t;
    if (a & 3) sprintf(out, "%s%d.%02d", t < 0 ? "-" : "", a >> 2, (a & 3) * 25);
    else sprintf(out, "%s%d", t < 0 ? "-" : "", a >> 2);
}

static void fmt_money(char *out, int32_t cents)
{
    int32_t a = cents < 0 ? -cents : cents;
    sprintf(out, "%c$%ld.%02ld", cents < 0 ? '-' : '+', (long)(a / 100), (long)(a % 100));
}

static void fmt_r(char *out, int32_t r100)
{
    int32_t a = r100 < 0 ? -r100 : r100;
    sprintf(out, "%c%ld.%02ldR", r100 < 0 ? '-' : '+', (long)(a / 100), (long)(a % 100));
}

/* ------------------------------------------------------------------ state */
typedef struct {
    uint8_t on, sym, micro, qty;
    int8_t side;
    int entry, stop, tgt;
    uint24_t ei;
} pos_t;

typedef struct {
    uint8_t sym, micro, qty, why;
    int8_t side;
    int entry, exitp, stopd;
    uint24_t ei, xi;
} trade_t;

#define MAXTR 250
typedef struct {
    char magic[4];
    uint24_t cur;
    uint8_t tf, view, tsym, zoom, speed, micro;
    int stopT[2], tgtT[2];
    uint24_t risk;
    pos_t pos;
    uint16_t ntr;
} save_t;

static save_t st;
static trade_t tr[MAXTR];
#define pos st.pos

static const uint8_t TFMIN[4] = { 1, 5, 15, 60 };
static const char *TFNAME[4] = { "1m", "5m", "15m", "1h" };
static const uint8_t CELL[5] = { 3, 5, 7, 9, 13 };
static const uint16_t SPDMS[5] = { 700, 300, 120, 40, 0 };
static const uint8_t SPDN[5] = { 1, 1, 1, 1, 4 };
static const int16_t TVC[2][2] = { { 500, 50 }, { 1250, 125 } }; /* cents per tick [sym][micro] */
static const char *CNAME[2][2] = { { "NQ", "MNQ" }, { "ES", "MES" } };

static bool playing;
static bool exited;
static char msg[44];
static clock_t msg_until;

static void say(const char *s)
{
    strncpy(msg, s, sizeof msg - 1);
    msg[sizeof msg - 1] = 0;
    msg_until = clock() + 3 * CLOCKS_PER_SEC;
}

static int32_t trade_cents(const trade_t *t)
{
    return (int32_t)(t->exitp - t->entry) * t->side * t->qty * TVC[t->sym][t->micro];
}

static int32_t trade_r100(const trade_t *t)
{
    return (int32_t)(t->exitp - t->entry) * t->side * 100 / t->stopd;
}

/* ------------------------------------------------------------------ trading */
static void close_pos(int price, uint8_t why)
{
    trade_t *t;
    char a[16], b[16], m[44];
    if (!pos.on) return;
    if (st.ntr >= MAXTR) { memmove(tr, tr + 1, sizeof(trade_t) * (MAXTR - 1)); st.ntr = MAXTR - 1; }
    t = &tr[st.ntr++];
    t->sym = pos.sym; t->micro = pos.micro; t->qty = pos.qty; t->why = why; t->side = pos.side;
    t->entry = pos.entry; t->exitp = price;
    t->stopd = pos.side > 0 ? pos.entry - pos.stop : pos.stop - pos.entry;
    t->ei = pos.ei; t->xi = st.cur;
    pos.on = 0;
    exited = true;
    fmt_money(a, trade_cents(t));
    fmt_r(b, trade_r100(t));
    sprintf(m, "%s %s %s", why == 'S' ? "STOPPED" : why == 'T' ? "TARGET" : "CLOSED", a, b);
    say(m);
}

static void check_exit(void)
{
    candle_t k;
    if (!pos.on) return;
    rd_candle(pos.sym, st.cur, &k);
    if (pos.side > 0) {
        if (k.l <= pos.stop) close_pos(k.o < pos.stop ? k.o : pos.stop, 'S');
        else if (k.h >= pos.tgt) close_pos(pos.tgt, 'T');
    } else {
        if (k.h >= pos.stop) close_pos(k.o > pos.stop ? k.o : pos.stop, 'S');
        else if (k.l <= pos.tgt) close_pos(pos.tgt, 'T');
    }
}

static int qty_for(uint8_t s)
{
    int32_t per = (int32_t)st.stopT[s] * TVC[s][st.micro];
    int32_t q = per > 0 ? (int32_t)st.risk * 100 / per : 0;
    return q > 99 ? 99 : (int)q;
}

static void open_pos(int8_t side)
{
    candle_t k;
    uint8_t s = st.tsym;
    int q;
    char m[44], a[16];
    if (pos.on) {
        if (pos.side == side) { say(side > 0 ? "Already long" : "Already short"); return; }
        rd_candle(pos.sym, st.cur, &k);
        close_pos(k.c, 'M');
        return;
    }
    q = qty_for(s);
    if (q < 1) {
        fmt_money(a, (int32_t)st.stopT[s] * TVC[s][st.micro]);
        sprintf(m, "Risk too small: 1 %s = %s", CNAME[s][st.micro], a + 1);
        say(m);
        return;
    }
    rd_candle(s, st.cur, &k);
    pos.on = 1; pos.sym = s; pos.micro = st.micro; pos.qty = (uint8_t)q; pos.side = side;
    pos.entry = k.c;
    pos.stop = k.c - side * st.stopT[s];
    pos.tgt = k.c + side * st.tgtT[s];
    pos.ei = st.cur;
    fmt_price(a, k.c);
    sprintf(m, "%s %d %s @ %s", side > 0 ? "BUY" : "SELL", q, CNAME[s][st.micro], a);
    say(m);
}

/* ------------------------------------------------------------------ stepping */
static bool step1(void)
{
    if (st.cur + 1 >= N) { playing = false; say("End of data pack"); return false; }
    st.cur++;
    check_exit();
    return true;
}

static void step_bar(void)
{
    uint8_t P = TFMIN[st.tf];
    uint32_t b;
    if (!step1() || P == 1) return;
    b = umin(st.cur) / P;
    while (st.cur + 1 < N && umin(st.cur + 1) / P == b) step1();
}

static void step_back(void)
{
    uint8_t P = TFMIN[st.tf];
    uint32_t b;
    uint24_t i = st.cur;
    if (pos.on) { say("Close the trade to step back"); return; }
    if (P > 1) {
        b = umin(i) / P;
        while (i > 0 && umin(i - 1) / P == b) i--;
    }
    if (i == 0) { say("Start of data pack"); return; }
    st.cur = i - 1;
}

/* index of the first candle at/after local time-of-day T (minutes) that is after `from`; 0 if none */
static uint24_t find_time(uint24_t from, int T)
{
    uint24_t i;
    uint32_t prev = lmin(from);
    for (i = from + 1; i < N; i++) {
        uint32_t L = lmin(i);
        uint32_t tgt = L - L % 1440 + (uint32_t)T;
        if (L >= tgt && prev < tgt) return i;
        prev = L;
    }
    return 0;
}

static void jump_to(int T, const char *name)
{
    char m[44];
    uint24_t i = find_time(st.cur, T);
    if (!i) { sprintf(m, "No later %s in this pack", name); say(m); return; }
    exited = false;
    while (st.cur + 1 < i) {
        step1();
        if (exited) return;
    }
}

/* ------------------------------------------------------------------ chart */
#define CHW 252
#define AXX 254
#define MAXB 90
typedef struct { uint24_t i0, i1; } span_t;
static span_t sp[MAXB];
static candle_t bar[MAXB];
static uint8_t nb;

static void build_spans(void)
{
    uint8_t P = TFMIN[st.tf];
    uint8_t want = (uint8_t)(CHW / CELL[st.zoom]);
    uint8_t k = 0, j;
    int32_t i = (int32_t)st.cur;
    if (want > MAXB) want = MAXB;
    while (k < want && i >= 0) {
        uint24_t e = (uint24_t)i, s = e;
        if (P > 1) {
            uint32_t b = umin(e) / P;
            while (s > 0 && umin(s - 1) / P == b) s--;
        }
        sp[k].i0 = s; sp[k].i1 = e;
        k++;
        i = (int32_t)s - 1;
    }
    nb = k;
    for (j = 0; j < k / 2; j++) { span_t t = sp[j]; sp[j] = sp[k - 1 - j]; sp[k - 1 - j] = t; }
}

static void agg(uint8_t s)
{
    uint8_t j;
    for (j = 0; j < nb; j++) {
        candle_t k, *b = &bar[j];
        uint24_t i;
        rd_candle(s, sp[j].i0, b);
        for (i = sp[j].i0 + 1; i <= sp[j].i1; i++) {
            rd_candle(s, i, &k);
            if (k.h > b->h) b->h = k.h;
            if (k.l < b->l) b->l = k.l;
            b->c = k.c;
        }
    }
}

static int py0, ph, phi, plo;
static int Y(int p)
{
    return py0 + (int)((int32_t)(phi - p) * (ph - 1) / (phi - plo));
}

static void dashed(int y, uint8_t col)
{
    int x;
    gfx_SetColor(col);
    for (x = 0; x < CHW; x += 6) gfx_HorizLine_NoClip(x, y, 3);
}

static void axis_tag(int p, int y, uint8_t bg, uint8_t fg)
{
    char b[16];
    fmt_price(b, p);
    if (y < py0 + 4) y = py0 + 4;
    if (y > py0 + ph - 5) y = py0 + ph - 5;
    gfx_SetColor(bg);
    gfx_FillRectangle_NoClip(AXX, y - 4, 66, 9);
    text(b, AXX + 1, y - 3, fg);
}

static const int NICE[] = { 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000 };

static void draw_pane(uint8_t s, int y0, int h, bool mark)
{
    uint8_t j, cell = CELL[st.zoom], bw = cell - 2;
    int hi = -1, lo = 0x7FFFFF, step, p, pad;
    char b[16];
    bool lines = pos.on && pos.sym == s;

    agg(s);
    for (j = 0; j < nb; j++) {
        if (bar[j].h > hi) hi = bar[j].h;
        if (bar[j].l < lo) lo = bar[j].l;
    }
    if (lines) {
        int a = pos.stop < pos.tgt ? pos.stop : pos.tgt, z = pos.stop < pos.tgt ? pos.tgt : pos.stop;
        if (z > hi) hi = z;
        if (a < lo) lo = a;
    }
    pad = (hi - lo) / 16 + 2;
    hi += pad; lo -= pad;
    py0 = y0; ph = h; phi = hi; plo = lo;

    /* grid: nice step in points, at most ~5 lines */
    for (j = 0; j < sizeof NICE / sizeof NICE[0] - 1; j++)
        if ((hi - lo) / (NICE[j] * 4) <= 5) break;
    step = NICE[j] * 4;
    for (p = (lo / step + 1) * step; p < hi; p += step) {
        int y = Y(p);
        gfx_SetColor(C_GRID);
        gfx_HorizLine_NoClip(0, y, CHW);
        if (y > y0 + 4 && y < y0 + h - 5) {
            sprintf(b, "%d", p >> 2);
            text(b, AXX + 1, y - 3, C_DIM);
        }
    }

    /* day separators (18:00 NY session start) and bars */
    for (j = 0; j < nb; j++) {
        candle_t *k = &bar[j];
        int x0 = j * cell + 1, top, bot;
        uint8_t col = k->c >= k->o ? C_UP : C_DN;
        if (j > 0 && (lmin(sp[j].i0) + 360) / 1440 != (lmin(sp[j - 1].i0) + 360) / 1440) {
            int y;
            gfx_SetColor(C_DAY);
            for (y = y0; y < y0 + h; y += 4) gfx_VertLine_NoClip(x0 - 1, y, 2);
        }
        gfx_SetColor(col);
        gfx_VertLine_NoClip(x0 + bw / 2, Y(k->h), Y(k->l) - Y(k->h) + 1);
        top = Y(k->c > k->o ? k->c : k->o);
        bot = Y(k->c > k->o ? k->o : k->c);
        gfx_FillRectangle_NoClip(x0, top, bw, bot - top + 1);
    }

    if (lines) {
        dashed(Y(pos.entry), C_BLUE);
        dashed(Y(pos.stop), C_DN);
        dashed(Y(pos.tgt), C_UP);
        axis_tag(pos.stop, Y(pos.stop), C_DN, C_WHITE);
        axis_tag(pos.tgt, Y(pos.tgt), C_UP, C_BLACK);
        axis_tag(pos.entry, Y(pos.entry), C_BLUE, C_WHITE);
    }
    if (nb) axis_tag(bar[nb - 1].c, Y(bar[nb - 1].c), C_YEL, C_BLACK);

    /* pane label */
    gfx_SetColor(C_BG);
    gfx_FillRectangle_NoClip(1, y0 + 1, 26, 9);
    text(SYM[s], 3, y0 + 2, mark ? C_YEL : C_TEXT);
    if (mark) text("*", 20, y0 + 2, C_YEL);
}

static void draw_status(void)
{
    char a[48], b[16], c[16], d[16];
    candle_t k;
    int32_t pnl;

    gfx_SetColor(C_BAR);
    gfx_FillRectangle_NoClip(0, 0, 320, 21);
    gfx_FillRectangle_NoClip(0, 217, 320, 23);

    /* line 1: symbol / tf / time / play */
    fmt_time(b, lmin(st.cur));
    sprintf(a, "%s %s  %s", st.view == 2 ? "NQ+ES" : SYM[st.view], TFNAME[st.tf], b);
    text(a, 2, 2, C_WHITE);
    if (playing) sprintf(a, "PLAY %u", st.speed + 1);
    else strcpy(a, "PAUSE");
    text(a, 318 - (int)gfx_GetStringWidth(a), 2, playing ? C_UP : C_DIM);

    /* line 2: prices of the current (possibly partial) bar */
    if (st.view == 2) {
        rd_candle(0, st.cur, &k); fmt_price(b, k.c);
        rd_candle(1, st.cur, &k); fmt_price(c, k.c);
        sprintf(a, "NQ %s   ES %s", b, c);
    } else {
        candle_t *x = &bar[nb ? nb - 1 : 0]; /* bar[] holds the pane just drawn */
        fmt_price(b, x->h); fmt_price(c, x->l); fmt_price(d, x->c);
        sprintf(a, "H %s L %s C %s", b, c, d);
    }
    text(a, 2, 12, C_TEXT);

    /* bottom line 1: message / position / flat summary */
    if (msg[0] && (int32_t)(msg_until - clock()) > 0) {
        text(msg, 2, 219, C_YEL);
    } else if (pos.on) {
        rd_candle(pos.sym, st.cur, &k);
        pnl = (int32_t)(k.c - pos.entry) * pos.side * pos.qty * TVC[pos.sym][pos.micro];
        fmt_price(b, pos.entry);
        fmt_money(c, pnl);
        fmt_r(d, (int32_t)(k.c - pos.entry) * pos.side * 100 / (pos.side > 0 ? pos.entry - pos.stop : pos.stop - pos.entry));
        sprintf(a, "%s %u %s @%s ", pos.side > 0 ? "LONG" : "SHORT", pos.qty, CNAME[pos.sym][pos.micro], b);
        text(a, 2, 219, pos.side > 0 ? C_UP : C_DN);
        sprintf(a, "%s %s", c, d);
        text(a, 318 - (int)gfx_GetStringWidth(a), 219, pnl >= 0 ? C_UP : C_DN);
    } else {
        uint16_t t;
        int32_t net = 0;
        for (t = 0; t < st.ntr; t++) net += trade_cents(&tr[t]);
        fmt_pts(b, st.stopT[st.tsym]);
        fmt_pts(c, st.tgtT[st.tsym]);
        sprintf(a, "Flat %s S%s T%s x%d", CNAME[st.tsym][st.micro], b, c, qty_for(st.tsym));
        text(a, 2, 219, C_DIM);
        fmt_money(d, net);
        sprintf(a, "Net %s", d);
        text(a, 318 - (int)gfx_GetStringWidth(a), 219, net >= 0 ? C_UP : C_DN);
    }

    /* bottom line 2: F-key labels under Y= WINDOW ZOOM TRACE GRAPH */
    {
        static const char *F[5] = { "VIEW", "JUMP", "RISK", "LOG", "HELP" };
        uint8_t f;
        for (f = 0; f < 5; f++) {
            gfx_SetColor(C_GRID);
            gfx_FillRectangle_NoClip(f * 64 + 2, 229, 60, 11);
            text(F[f], f * 64 + 32 - (int)gfx_GetStringWidth(F[f]) / 2, 231, C_TEXT);
        }
    }
}

static void render(void)
{
    gfx_FillScreen(C_BG);
    gfx_SetColor(C_GRID);
    gfx_VertLine_NoClip(CHW + 1, 22, 194);
    build_spans();
    if (st.view == 2) {
        draw_pane(0, 22, 96, st.tsym == 0);
        gfx_SetColor(C_DAY);
        gfx_HorizLine_NoClip(0, 119, 320);
        draw_pane(1, 120, 96, st.tsym == 1);
    } else {
        draw_pane(st.view, 22, 194, false);
    }
    draw_status();
    gfx_SwapDraw();
}

/* ------------------------------------------------------------------ dialogs */
static uint8_t wait_key(void)
{
    uint8_t k;
    while (!(k = os_GetCSC())) ;
    return k;
}

static void panel(int x, int y, int w, int h, const char *title)
{
    gfx_SetColor(C_BAR);
    gfx_FillRectangle_NoClip(x, y, w, h);
    gfx_SetColor(C_DIM);
    gfx_Rectangle_NoClip(x, y, w, h);
    gfx_SetColor(C_SEL);
    gfx_FillRectangle_NoClip(x + 1, y + 1, w - 2, 11);
    text(title, x + 4, y + 3, C_WHITE);
}

static void jump_menu(void)
{
    static const int T[6] = { 1080, 0, 120, 510, 570, 810 };
    static const char *L[6] = { "18:00 Globex open", "00:00 Midnight", "02:00 London",
                                "08:30 NY data", "09:30 NY open", "13:30 NY PM" };
    static const char *NM[6] = { "18:00", "00:00", "02:00", "08:30", "09:30", "13:30" };
    char b[32];
    uint8_t i, k;
    render(); /* fresh frame in front buffer */
    gfx_SetDrawScreen();
    panel(60, 50, 200, 112, "Jump to next session open");
    for (i = 0; i < 6; i++) {
        sprintf(b, "%u  %s", i + 1, L[i]);
        text(b, 70, 66 + i * 12, C_TEXT);
    }
    text("0  Start of pack", 70, 66 + 6 * 12, C_TEXT);
    text("clear  cancel", 70, 66 + 7 * 12 + 4, C_DIM);
    gfx_SetDrawBuffer();
    k = wait_key();
    switch (k) {
        case sk_1: i = 0; break;
        case sk_2: i = 1; break;
        case sk_3: i = 2; break;
        case sk_4: i = 3; break;
        case sk_5: i = 4; break;
        case sk_6: i = 5; break;
        case sk_0:
            if (pos.on) say("Close the trade first");
            else st.cur = 0;
            return;
        default: return;
    }
    playing = false;
    jump_to(T[i], NM[i]);
}

/* numeric field editor for the risk screen */
static bool edit_num(char *buf, uint8_t key)
{
    uint8_t n = (uint8_t)strlen(buf);
    static const uint8_t DK[10] = { sk_0, sk_1, sk_2, sk_3, sk_4, sk_5, sk_6, sk_7, sk_8, sk_9 };
    uint8_t d;
    for (d = 0; d < 10; d++)
        if (key == DK[d]) { if (n < 7) { buf[n] = (char)('0' + d); buf[n + 1] = 0; } return true; }
    if (key == sk_DecPnt) { if (n < 7 && !strchr(buf, '.')) { buf[n] = '.'; buf[n + 1] = 0; } return true; }
    if (key == sk_Del) { if (n) buf[n - 1] = 0; return true; }
    return false;
}

/* "12.5" -> 1250 (hundredths) */
static int32_t parse100(const char *s)
{
    int32_t w = 0, f = 0;
    uint8_t fd = 0;
    bool dot = false;
    for (; *s; s++) {
        if (*s == '.') { dot = true; continue; }
        if (!dot) w = w * 10 + (*s - '0');
        else if (fd < 2) { f = f * 10 + (*s - '0'); fd++; }
    }
    if (fd == 1) f *= 10;
    return w * 100 + f;
}

static void risk_menu(void)
{
    static const char *L[6] = { "NQ stop (pts)", "NQ target (pts)", "ES stop (pts)", "ES target (pts)", "Risk per trade $", "Contracts" };
    uint8_t sel = 0, k, i;
    char buf[10] = "";
    char b[48], v[16];
    for (;;) {
        gfx_SetDrawScreen();
        panel(20, 30, 280, 170, "Risk & sizing");
        for (i = 0; i < 6; i++) {
            int y = 48 + i * 14;
            if (i == sel) { gfx_SetColor(C_SEL); gfx_FillRectangle_NoClip(24, y - 2, 272, 12); }
            text(L[i], 30, y, C_TEXT);
            if (i == sel && buf[0]) strcpy(v, buf);
            else if (i < 4) fmt_pts(v, i == 0 ? st.stopT[0] : i == 1 ? st.tgtT[0] : i == 2 ? st.stopT[1] : st.tgtT[1]);
            else if (i == 4) sprintf(v, "%lu", (unsigned long)st.risk);
            else strcpy(v, st.micro ? "Micro (MNQ/MES)" : "Full (NQ/ES)");
            text(v, 170, y, i == sel && buf[0] ? C_YEL : C_WHITE);
        }
        for (i = 0; i < 2; i++) {
            int q = qty_for(i);
            fmt_money(v, (int32_t)q * st.stopT[i] * TVC[i][st.micro]);
            sprintf(b, "%s: %d x %s = %s risk", SYM[i], q, CNAME[i][st.micro], v + 1);
            text(b, 30, 136 + i * 12, q ? C_DIM : C_DN);
        }
        text("$/pt: NQ 20 MNQ 2 ES 50 MES 5", 30, 160, C_DIM);
        text("digits . del: edit  enter: set", 30, 172, C_DIM);
        text("up/down: field  clear: done", 30, 184, C_DIM);
        gfx_SetDrawBuffer();
        k = wait_key();
        if (sel < 5 && edit_num(buf, k)) continue;
        if (k == sk_Enter || k == sk_Up || k == sk_Down || k == sk_Clear) {
            if (buf[0]) {
                int32_t h = parse100(buf);
                if (sel < 4) {
                    int t = (int)((h + 12) / 25);
                    if (t < 1) t = 1;
                    if (t > 8000) t = 8000;
                    if (sel == 0) st.stopT[0] = t; else if (sel == 1) st.tgtT[0] = t;
                    else if (sel == 2) st.stopT[1] = t; else st.tgtT[1] = t;
                } else if (sel == 4) {
                    h /= 100;
                    st.risk = (uint24_t)(h < 1 ? 1 : h > 999999 ? 999999 : h);
                }
                buf[0] = 0;
            } else if (k == sk_Enter && sel == 5) st.micro ^= 1;
            if (k == sk_Up) sel = sel ? sel - 1 : 5;
            if (k == sk_Down) sel = sel < 5 ? sel + 1 : 0;
            if (k == sk_Clear) return;
        }
    }
}

static void log_screen(void)
{
    int top = 0;
    uint8_t k, confirm = 0;
    for (;;) {
        char a[48], b[16], c[16], d[16];
        uint16_t i, wins = 0;
        int32_t net = 0, gw = 0, gl = 0, rs = 0;
        int y;
        for (i = 0; i < st.ntr; i++) {
            int32_t p = trade_cents(&tr[i]);
            net += p; rs += trade_r100(&tr[i]);
            if (p > 0) { wins++; gw += p; } else gl -= p;
        }
        gfx_SetDrawScreen();
        gfx_FillScreen(C_BG);
        gfx_SetColor(C_BAR);
        gfx_FillRectangle_NoClip(0, 0, 320, 44);
        sprintf(a, "Trade log - %s %s", tag, label);
        text(a, 2, 2, C_WHITE);
        fmt_money(b, net);
        sprintf(a, "Trades %u  Win %u%%  Net %s", st.ntr, st.ntr ? (unsigned)(wins * 100u / st.ntr) : 0u, b);
        text(a, 2, 14, net >= 0 ? C_UP : C_DN);
        fmt_r(c, rs);
        fmt_r(d, st.ntr ? rs / st.ntr : 0);
        if (gl > 0) sprintf(b, "%ld.%02ld", (long)(gw / gl), (long)(gw * 100 / gl % 100));
        else strcpy(b, st.ntr ? "inf" : "-");
        sprintf(a, "Total %s  Avg %s  PF %s", c, d, b);
        text(a, 2, 26, C_TEXT);

        y = 48;
        if (!st.ntr) text("No trades yet. 2nd=buy, alpha=sell.", 2, y, C_DIM);
        for (i = (uint16_t)top; i < st.ntr && y < 216; i++) {
            const trade_t *t = &tr[st.ntr - 1 - i]; /* newest first */
            int32_t p = trade_cents(t);
            fmt_price(b, t->entry);
            fmt_money(c, p);
            fmt_r(d, trade_r100(t));
            sprintf(a, "%3u %c %u%s %s %c %s %s", st.ntr - i, t->side > 0 ? 'L' : 'S', t->qty, CNAME[t->sym][t->micro],
                    b, t->why, c, d);
            text(a, 2, y, p > 0 ? C_UP : p < 0 ? C_DN : C_TEXT);
            fmt_time(b, lmin(t->ei));
            fmt_time(c, lmin(t->xi));
            fmt_price(d, t->exitp);
            sprintf(a, "  %s > %s  x %s", b + 4, c + 4, d);
            text(a, 2, y + 10, C_DIM);
            y += 22;
        }
        gfx_SetColor(C_BAR);
        gfx_FillRectangle_NoClip(0, 228, 320, 12);
        text(confirm ? "Press del again to erase ALL trades" : "up/dn scroll  del: erase log  clear: back", 2, 230,
             confirm ? C_DN : C_DIM);
        gfx_SetDrawBuffer();
        k = wait_key();
        if (k == sk_Clear) return;
        if (k == sk_Down && top + 7 < st.ntr) top++;
        if (k == sk_Up && top > 0) top--;
        if (k == sk_Del) {
            if (confirm) { st.ntr = 0; top = 0; confirm = 0; }
            else confirm = 1;
        } else confirm = 0;
    }
}

static void help_screen(void)
{
    static const char *H[] = {
        "right / left  step one bar fwd / back",
        ".             step one minute",
        "enter         play / pause",
        "up / down     play speed",
        "1 2 3 4       timeframe 1m 5m 15m 1h",
        "+ / -         zoom in / out",
        "2nd / alpha   BUY / SELL market",
        "del           close position",
        "mode          trade NQ or ES (split)",
        "y=   VIEW     NQ / ES / split SMT",
        "window JUMP   session opens",
        "zoom RISK     stop, target, $ risk",
        "trace LOG     trades and stats",
        "clear         save and exit",
        "",
        "Stop is checked before target on",
        "every 1m candle. Fill = bar close.",
    };
    uint8_t i;
    gfx_SetDrawScreen();
    gfx_FillScreen(C_BG);
    text("GrayReplays - keys", 2, 2, C_YEL);
    for (i = 0; i < sizeof H / sizeof H[0]; i++) text(H[i], 2, 16 + i * 12, C_TEXT);
    text("any key: back", 2, 230, C_DIM);
    gfx_SetDrawBuffer();
    wait_key();
}

/* ------------------------------------------------------------------ save / load */
static void save_name(char *nm) { sprintf(nm, "GS%s", tag); }

static void save_session(void)
{
    char nm[9];
    uint8_t h;
    save_name(nm);
    ti_Delete(nm);
    h = ti_Open(nm, "w");
    if (!h) return;
    memcpy(st.magic, "GRSV", 4);
    ti_Write(&st, sizeof st, 1, h);
    if (st.ntr) ti_Write(tr, sizeof(trade_t), st.ntr, h);
    ti_Close(h);
}

static bool load_session(void)
{
    char nm[9];
    uint8_t h;
    save_t t;
    bool ok = false;
    save_name(nm);
    h = ti_Open(nm, "r");
    if (!h) return false;
    if (ti_Read(&t, sizeof t, 1, h) == 1 && !memcmp(t.magic, "GRSV", 4) && t.cur < N && t.ntr <= MAXTR) {
        st = t;
        ok = ti_Read(tr, sizeof(trade_t), st.ntr, h) == st.ntr;
        if (!ok) st.ntr = 0;
        ok = true;
    }
    ti_Close(h);
    return ok;
}

static void archive_save(void)
{
    char nm[9];
    uint8_t h;
    save_name(nm);
    h = ti_Open(nm, "r");
    if (h) { ti_SetArchiveStatus(true, h); ti_Close(h); }
}

static void defaults(void)
{
    uint24_t i;
    memset(&st, 0, sizeof st);
    st.tf = 0; st.view = 0; st.tsym = 0; st.zoom = 1; st.speed = 1; st.micro = 0;
    st.stopT[0] = 20 * 4; st.tgtT[0] = 40 * 4;
    st.stopT[1] = 5 * 4;  st.tgtT[1] = 10 * 4;
    st.risk = 500;
    i = find_time(0, 570);
    st.cur = i ? i - 1 : (N > 120 ? 120 : N - 1);
}

/* ------------------------------------------------------------------ replay loop */
static void replay(void)
{
    bool dirty = true;
    clock_t last = clock();
    msg[0] = 0;
    playing = false;
    for (;;) {
        uint8_t k;
        if (dirty) { render(); dirty = false; }
        k = os_GetCSC();
        if (!k) {
            if (playing && (clock_t)(clock() - last) >= (clock_t)SPDMS[st.speed] * CLOCKS_PER_SEC / 1000) {
                uint8_t n;
                last = clock();
                exited = false;
                for (n = 0; n < SPDN[st.speed] && playing; n++) {
                    if (!step1()) break;
                    if (exited) { playing = false; break; }
                }
                dirty = true;
            } else if (msg[0] && (int32_t)(msg_until - clock()) <= 0) {
                msg[0] = 0;
                dirty = true;
            }
            continue;
        }
        dirty = true;
        switch (k) {
            case sk_Right: playing = false; step_bar(); break;
            case sk_Left: playing = false; step_back(); break;
            case sk_DecPnt: playing = false; step1(); break;
            case sk_Enter: playing = !playing; last = clock(); break;
            case sk_Up: if (st.speed < 4) st.speed++; break;
            case sk_Down: if (st.speed > 0) st.speed--; break;
            case sk_1: st.tf = 0; break;
            case sk_2: st.tf = 1; break;
            case sk_3: st.tf = 2; break;
            case sk_4: st.tf = 3; break;
            case sk_Add: if (st.zoom < 4) st.zoom++; break;
            case sk_Sub: if (st.zoom > 0) st.zoom--; break;
            case sk_2nd: open_pos(1); break;
            case sk_Alpha: open_pos(-1); break;
            case sk_Del:
                if (pos.on) { candle_t c; rd_candle(pos.sym, st.cur, &c); close_pos(c.c, 'M'); }
                break;
            case sk_Mode:
                if (st.view == 2) { st.tsym ^= 1; say(st.tsym ? "Orders go to ES" : "Orders go to NQ"); }
                break;
            case sk_Yequ:
                st.view = (uint8_t)((st.view + 1) % 3);
                if (st.view < 2) st.tsym = st.view;
                break;
            case sk_Window: jump_menu(); break;
            case sk_Zoom: playing = false; risk_menu(); break;
            case sk_Trace: playing = false; log_screen(); break;
            case sk_Graph: playing = false; help_screen(); break;
            case sk_Clear: save_session(); return;
            default: dirty = false; break;
        }
    }
}

/* ------------------------------------------------------------------ title */
#define MAXPK 12
static char pk[MAXPK][9];
static char pklabel[MAXPK][25];

static uint8_t scan_packs(void)
{
    void *vat = NULL;
    char *nm;
    uint8_t n = 0;
    while (n < MAXPK && (nm = ti_Detect(&vat, "GRPK"))) {
        const uint8_t *p;
        strncpy(pk[n], nm, 8); pk[n][8] = 0;
        p = open_ptr(pk[n]);
        if (p) { memcpy(pklabel[n], p + 26, 24); pklabel[n][24] = 0; } else pklabel[n][0] = 0;
        n++;
    }
    return n;
}

static void draw_title(uint8_t n, uint8_t sel, const char *err)
{
    uint8_t i;
    char b[48];
    gfx_SetDrawScreen();
    gfx_FillScreen(C_BG);
    /* little candle logo */
    gfx_SetColor(C_UP);
    gfx_VertLine_NoClip(124, 14, 30); gfx_FillRectangle_NoClip(121, 20, 7, 16);
    gfx_SetColor(C_DN);
    gfx_VertLine_NoClip(136, 22, 26); gfx_FillRectangle_NoClip(133, 26, 7, 14);
    gfx_SetColor(C_UP);
    gfx_VertLine_NoClip(148, 10, 28); gfx_FillRectangle_NoClip(145, 14, 7, 18);
    gfx_SetColor(C_DN);
    gfx_VertLine_NoClip(160, 18, 22); gfx_FillRectangle_NoClip(157, 22, 7, 10);
    gfx_SetColor(C_UP);
    gfx_VertLine_NoClip(172, 6, 30); gfx_FillRectangle_NoClip(169, 8, 7, 22);
    gfx_SetColor(C_UP);
    gfx_VertLine_NoClip(184, 2, 26); gfx_FillRectangle_NoClip(181, 4, 7, 16);
    gfx_SetTextScale(3, 3);
    text_c("GrayReplays", 56, C_WHITE);
    gfx_SetTextScale(1, 1);
    text_c("NQ / ES bar replay  -  TI-84 Plus CE", 86, C_DIM);

    gfx_SetColor(C_GRID);
    gfx_HorizLine_NoClip(20, 102, 280);
    if (!n) {
        text_c("No data packs found.", 120, C_YEL);
        text_c("Make them on the PC with grpack.py and", 140, C_TEXT);
        text_c("send GH*, GN*, GE* appvars to Archive.", 152, C_TEXT);
    } else {
        text("Choose a data pack:", 24, 108, C_TEXT);
        for (i = 0; i < n; i++) {
            int y = 122 + i * 12;
            if (y > 206) break;
            if (i == sel) { gfx_SetColor(C_SEL); gfx_FillRectangle_NoClip(20, y - 2, 280, 12); }
            sprintf(b, "%-6s %s", pk[i] + 2, pklabel[i]);
            text(b, 28, y, i == sel ? C_WHITE : C_TEXT);
        }
    }
    if (err && err[0]) text_c(err, 210, C_DN);
    text_c(n ? "enter: open   graph: keys   clear: quit" : "clear: quit", 228, C_DIM);
}

int main(void)
{
    uint8_t n, sel = 0, k;
    bool any = false;
    gfx_Begin();
    set_palette();
    gfx_SetMonospaceFont(8);
    gfx_SetTextConfig(gfx_text_clip);
    gfx_SetTextTransparentColor(255);
    gfx_SetTextBGColor(255);
    errmsg[0] = 0;
    for (;;) {
        n = scan_packs();
        if (sel >= n) sel = 0;
        draw_title(n, sel, errmsg);
        k = wait_key();
        if (k == sk_Clear) break;
        if (k == sk_Graph) { help_screen(); continue; }
        if (!n) continue;
        if (k == sk_Up) sel = sel ? sel - 1 : n - 1;
        else if (k == sk_Down) sel = sel + 1 < n ? sel + 1 : 0;
        else if (k == sk_Enter) {
            errmsg[0] = 0;
            if (!load_pack(pk[sel])) continue;
            defaults();
            {
                save_t keep = st;
                if (load_session()) {
                    gfx_SetDrawScreen();
                    panel(50, 90, 220, 50, "Saved session found");
                    text("enter: resume   del: start new", 58, 112, C_TEXT);
                    k = wait_key();
                    if (k == sk_Del) { st = keep; }
                    else if (k != sk_Enter) continue;
                }
            }
            gfx_SetDrawBuffer();
            replay();
            any = true;
            gfx_SetDrawScreen();
            gfx_SetTextScale(1, 1);
        }
    }
    gfx_End();
    if (any) {
        /* archive save files so a RAM reset does not lose the trade log */
        void *vat = NULL;
        char *nm;
        uint8_t m = 0, i;
        while (m < MAXPK && (nm = ti_Detect(&vat, "GRSV"))) {
            strncpy(pk[m], nm, 8); pk[m][8] = 0;
            if (pk[m][0] == 'G' && pk[m][1] == 'S') m++;
        }
        for (i = 0; i < m; i++) { memcpy(tag, pk[i] + 2, 7); archive_save(); }
    }
    return 0;
}
