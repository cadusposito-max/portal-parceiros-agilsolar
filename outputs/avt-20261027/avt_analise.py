"""Confere a coleta da AVT (avt_varredura.json): frete por cidade, decomposição dos kits e regras."""
import json, math, sys
from collections import defaultdict, Counter

arq = sys.argv[1]
D = json.load(open(arq, encoding='utf-8'))
PU = {int(k): v for k, v in D['precos'].items()}
S = D['sweep']

def preco(i):
    p = PU.get(int(i))
    return p and p.get('preco')

# ---------- frete ----------
FAIXAS = [(4000, 0.105), (7500, 0.056), (10000, 0.042), (math.inf, 0.04)]

def final_avt(v, minimo=420, faixas=FAIXAS):
    n = round(v * 1.02, 2)
    p = next(p for lim, p in faixas if n < lim)
    return round(max(n + minimo, n / (1 - p)), 2)

def analisa_frete():
    print('== frete por cidade ==')
    for cid, pts in D['freteCid'].items():
        # mínimo: pontos baixos onde f - 1.02 v é constante
        mins = Counter(round(f - round(v * 1.02, 2), 2) for v, f in pts if v <= 2000)
        minimo = mins.most_common(1)[0][0] if mins else None
        # percentuais implícitos onde não é o mínimo
        ps = []
        for v, f in pts:
            n = round(v * 1.02, 2)
            if abs(f - n - minimo) > 0.02:
                ps.append((n, round(1 - n / f, 5)))
        faixas = []
        for n, p in sorted(ps):
            if faixas and abs(faixas[-1][2] - p) < 0.0002:
                faixas[-1][1] = n
            else:
                faixas.append([n, n, p])
        erro = max(abs(final_avt(v, minimo, FAIXAS) - f) for v, f in pts)
        print(f'{cid:14} n={len(pts):4} minimo={minimo}  erro_regra_aracatuba={erro:.2f}')
        for a, b, p in faixas:
            print(f'    N {a:>10.2f} .. {b:>10.2f}  p={p}')

# ---------- kits ----------
def cabo_custo(n, mm):
    m = 2 * n
    if mm == 4:
        rolos = [25, 50, 75, 100]; pm = 5
    else:
        rolos = [25, 50, 100]; pm = 6
    if m <= rolos[-1]:
        metros = next(r for r in rolos if r >= m)
    else:
        metros = math.ceil(m / 100) * 100
    return 2 * metros * pm, metros

def decompoe(idp, n, modo, e):
    micro = modo == 'micro'
    fil = S['fil'].get(f'{idp}|{n}|{1 if micro else 0}')
    pp = S['painel'][str(idp)]['preco']
    if not fil:
        return None
    rest = round((e[2] - n * pp - fil['vt']) * 100)
    p = preco(e[0])
    if not p:
        return {'q': None, 'motivo': 'sem preço'}
    p = round(p * 100)
    sols = []
    for mm in ([6, 4] if modo.startswith('tri') else [4, 6]):
        cc, metros = cabo_custo(n, mm)
        for extra in (0, 1, -1, 2):  # rolo a mais/menos
            c = cc + extra * 2 * 25 * (5 if mm == 4 else 6)
            for q in range(1, 60):
                r = rest - q * p - c * 100
                if r < 0:
                    break
                if r % 1260 == 0:
                    sols.append({'q': q, 'k': r // 1260, 'mm': mm, 'cabo': c, 'extra': extra})
        if sols:
            break
    if not sols:
        return {'q': None, 'motivo': f'rest {rest/100}'}
    sols.sort(key=lambda s: (abs(s['extra']), s['k']))
    return sols[0]

def analisa_kits():
    print('== kits ==')
    tot = falha = 0
    porpainel = Counter()
    exemplos = []
    extra = Counter()
    for key, lista in S['res'].items():
        idp, n, modo = key.split('|'); n = int(n)
        if not isinstance(lista, list):
            continue
        porpainel[idp] += 1
        for e in lista:
            tot += 1
            d = decompoe(idp, n, modo, e)
            if not d or d.get('q') is None:
                falha += 1
                if len(exemplos) < 15:
                    exemplos.append((key, e[1], d))
            else:
                extra[(modo, d['mm'], d['extra'])] += 1
            if abs(final_avt(e[2]) - e[3]) > 0.02:
                print('frete diverge', key, e[1], e[2], e[3], final_avt(e[2]))
    print('combinações:', tot, 'sem decomposição:', falha, dict(porpainel))
    print('cabo (modo, mm, rolo extra):', dict(extra))
    for x in exemplos:
        print('  ', x)

if __name__ == '__main__':
    analisa_frete()
    analisa_kits()
