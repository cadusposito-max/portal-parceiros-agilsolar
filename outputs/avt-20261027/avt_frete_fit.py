import json, sys, statistics
D = json.load(open(sys.argv[1], encoding='utf-8'))
T = [4000, 7500, 10000, 15000, 30000, 40000, 50000, 60000, 70000, None]
def r2(x): return round(x + 1e-9, 2)
def final(v, mn, fx):
    n = r2(v * 1.02)
    p = next(p for lim, p in fx if lim is None or n < lim)
    return r2(max(n + mn, n / (1 - p)))
regras = {}
for cid, pts in D['freteCid'].items():
    mn = statistics.mode(r2(f - r2(v * 1.02)) for v, f in pts if v <= 1500)
    fx = []
    lo = 0
    for lim in T:
        ps = [1 - r2(v * 1.02) / f for v, f in pts if lo <= r2(v * 1.02) < (lim or 1e18) and abs(f - r2(v * 1.02) - mn) > 0.02]
        p = round(statistics.median(ps), 4) if ps else 0.0
        fx.append([lim, p]); lo = lim or 0
    # tenta 5 casas se 4 não fecha
    for i, (lim, p) in enumerate(fx):
        lo = 0 if i == 0 else fx[i-1][0]
        band = [(v, f) for v, f in pts if lo <= r2(v * 1.02) < (lim or 1e18)]
        if max((abs(final(v, mn, fx) - f) for v, f in band), default=0) > 0.011 and p:
            best = min((round(p + d / 1e6, 6) for d in range(-200, 201)), key=lambda q: max(abs(final(v, mn, fx[:i] + [[lim, q]] + fx[i+1:]) - f) for v, f in band))
            fx[i][1] = best
    # junta faixas iguais seguidas
    comp = []
    for lim, p in fx:
        if comp and comp[-1][1] == p: comp[-1][0] = lim
        else: comp.append([lim, p])
    err = max(abs(final(v, mn, comp) - f) for v, f in pts)
    regras[cid] = {'da': 0.02, 'minimo': mn, 'faixas': comp}
    print(f'{cid:14} min {mn:7} erro {err:.2f}  ' + '  '.join(f"<{l or 'inf'}:{p*100:.4g}%" for l, p in comp))
json.dump(regras, open(sys.argv[2], 'w'), indent=1)
