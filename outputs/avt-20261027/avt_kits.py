import json, sys, re
from collections import defaultdict, Counter
D = json.load(open(sys.argv[1], encoding='utf-8'))
S = D['sweep']; PU = {int(k): v for k, v in D['precos'].items()}
MARCA = lambda nome: ('HYXIPOWER' if 'HYX' in nome else next((m for m in ['SOFAR','AUXSOL','SUNGROW','SOLIS'] if m in nome), '?'))
def cabo(n, mm):
    m = 2*n; rolos = [25,50,75,100] if mm == 4 else [25,50,100]; pm = 5 if mm == 4 else 6
    met = next((r for r in rolos if r >= m), None) or -(-m//100)*100
    return 2*met*pm
def qtd(idp, n, modo, e):
    micro = modo == 'micro'
    fil = S['fil'][f'{idp}|{n}|{1 if micro else 0}']; pp = S['painel'][idp]['preco']
    rest = round((e[2] - n*pp - fil['vt'])*100); p = round(PU[e[0]]['preco']*100)
    if micro: return -(-n//4)
    mm = 6 if modo.startswith('tri') else 4
    for extra in (0, 1):
        c = round((cabo(n, mm) + extra*2*25*(6 if mm == 6 else 5))*100)
        for q in range(1, 60):
            r = rest - q*p - c
            if r < 0: break
            if r % 1260 == 0: return q
kits = []
for idp, pinfo in S['painel'].items():
    for n in range(4, 151):
        por_marca = {}
        for modo in ('mono', 'tri220'):
            for e in S['res'].get(f'{idp}|{n}|{modo}', []) if isinstance(S['res'].get(f'{idp}|{n}|{modo}'), list) else []:
                if qtd(idp, n, modo, e) != 1: continue
                m = MARCA(e[1])
                if m in por_marca and por_marca[m]['modo'] == 'mono' and modo != 'mono': continue
                if m not in por_marca or (por_marca[m]['modo'] == modo and e[2] < por_marca[m]['pecas']):
                    por_marca[m] = {'modo': modo, 'inv': e[0], 'nome': e[1], 'pecas': e[2], 'custo': e[3], 'q': 1}
        for m, k in por_marca.items():
            kits.append({'painel': int(idp), 'wp': pinfo['wp'], 'n': n, 'marca': m, **k})
        micro = [e for e in (S['res'].get(f'{idp}|{n}|micro') or []) if isinstance(e, list)]
        if micro:
            e = min(micro, key=lambda e: e[2])
            kits.append({'painel': int(idp), 'wp': pinfo['wp'], 'n': n, 'marca': 'HYXIPOWER', 'modo': 'micro', 'inv': e[0], 'nome': e[1], 'pecas': e[2], 'custo': e[3], 'q': -(-n//4)})
c = Counter((k['painel'], k['marca'] if k['modo'] != 'micro' else 'MICRO') for k in kits)
print('kits:', len(kits))
for idp, pinfo in S['painel'].items():
    print(' ', pinfo['desc'][:30], {m: c[(int(idp), m)] for m in ['SOFAR','AUXSOL','HYXIPOWER','SUNGROW','MICRO']},
          'n', min(k['n'] for k in kits if k['painel']==int(idp)), '-', max(k['n'] for k in kits if k['painel']==int(idp)))
# cobertura: n sem kit com inversor de string
for idp in S['painel']:
    falta = [n for n in range(5,151) if not any(k['painel']==int(idp) and k['n']==n and k['modo']!='micro' for k in kits)]
    if falta: print('  sem string', idp, falta[:20])
json.dump(kits, open(sys.argv[2], 'w'), ensure_ascii=False)
