import json, sys, re
from collections import defaultdict
sys.path.insert(0, '.')
import importlib.util
spec = importlib.util.spec_from_file_location('an', 'avt_analise.py')
D = json.load(open(sys.argv[1], encoding='utf-8'))
S = D['sweep']; PU = {int(k): v for k, v in D['precos'].items()}
def cabo(n, mm):
    m = 2*n; rolos = [25,50,75,100] if mm == 4 else [25,50,100]; pm = 5 if mm == 4 else 6
    met = next((r for r in rolos if r >= m), None) or -(-m//100)*100
    return 2*met*pm
def dec(idp, n, modo, e):
    micro = modo == 'micro'
    fil = S['fil'][f'{idp}|{n}|{1 if micro else 0}']; pp = S['painel'][idp]['preco']
    rest = round((e[2] - n*pp - fil['vt'])*100); p = round(PU[e[0]]['preco']*100)
    mm = 6 if modo.startswith('tri') else 4
    for extra in (0, 1):
        c = round((cabo(n, mm) + extra*2*25*(6 if mm == 6 else 5))*100)
        if micro:
            q = -(-n//4); r = rest - q*p - c - n*1260
            if r == 0: return q, n, extra
            continue
        for q in range(1, 60):
            r = rest - q*p - c
            if r < 0: break
            if r % 1260 == 0: return q, r//1260, extra
    return None
inv = {}
for key, lista in S['res'].items():
    idp, n, modo = key.split('|'); n = int(n)
    if not isinstance(lista, list): continue
    wp = S['painel'][idp]['wp']
    for e in lista:
        d = dec(idp, n, modo, e)
        x = inv.setdefault(e[0], {'nome': e[1], 'modos': set(), 'k1': set(), 'faixa': defaultdict(list), 'extra': 0})
        x['modos'].add(modo)
        if d is None: x.setdefault('falha', []).append(key); continue
        q, k, extra = d
        x['extra'] += extra
        if modo != 'micro': x['k1'].add(k / q)
        if q == 1 or modo == 'micro': x['faixa'][(idp, modo)].append(n)
out = []
for i, x in sorted(inv.items(), key=lambda t: t[1]['nome']):
    fx = {f'{p}/{m}': (min(v), max(v), len(v)) for (p, m), v in x['faixa'].items()}
    kw = [round(min(v)*S['painel'][p]['wp']/1000, 2) for (p, m), v in x['faixa'].items()]
    kwM = [round(max(v)*S['painel'][p]['wp']/1000, 2) for (p, m), v in x['faixa'].items()]
    print(i, x['nome'][:42], 'R$', PU[i]['preco'], sorted(x['modos']), 'k1', sorted(x['k1']), 'extra', x['extra'], 'falha', len(x.get('falha', [])))
    if kw: print('    kWp q=1:', min(kw), '-', max(kwM), ' | min por painel', sorted(set(kw)), ' max por painel', sorted(set(kwM)))
    out.append({'id': i, 'nome': x['nome'], 'preco': PU[i]['preco'], 'modos': sorted(x['modos']), 'k1': sorted(x['k1']), 'faixa': {k: list(v) for k, v in fx.items()}})
json.dump(out, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
