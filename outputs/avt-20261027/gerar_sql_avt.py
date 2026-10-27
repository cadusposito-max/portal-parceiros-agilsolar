"""Gera o SQL de dados da AVT (distribuidora, equipamentos, ofertas, estruturas, frete e kits).
Uso: py -I gerar_sql_avt.py avt_varredura.json avt_kits.json avt_inversores.json frete_regras_avt.json saida_dir
"""
import json, math, sys, uuid, os, re

D = json.load(open(sys.argv[1], encoding='utf-8'))
KITS = json.load(open(sys.argv[2], encoding='utf-8'))
INVS = {i['id']: i for i in json.load(open(sys.argv[3], encoding='utf-8'))}
FRETE = json.load(open(sys.argv[4], encoding='utf-8'))
OUT = sys.argv[5]
S = D['sweep']; PU = {int(k): v for k, v in D['precos'].items()}

NS = uuid.UUID('6f1c1f0e-2b7a-4c55-9a51-0a7c0a7e2710')
uid = lambda s: str(uuid.uuid5(NS, s))
AVT = uid('distribuidora:avt')
MATRIZ = 'af146be2-1489-4ad0-82f8-802b9dec5b6b'
GOIANIA = 'abb22e55-40d0-466f-b813-76cc5b58d9ca'
FRANQ = {'Aracatuba': MATRIZ, 'Caraguatatuba': '28965760-5b68-4b92-8fe7-9996d1944408', 'Goiania': GOIANIA,
         'Londrina': '6d4a2dd4-4da2-48cc-ba32-fff0ee98da78', 'RioClaro': 'bde94862-10d2-4c33-a259-d4e5667a0641',
         'SJC': 'c722efaa-c5fe-474c-9124-4bc9679c9e5b', 'Ubatuba': '80d0f57c-656d-49c4-976c-8e21ce60d3cf',
         'Varginha': '06694389-d2e4-46a7-9402-e2118580a642'}

# ---------- equipamentos ----------
# avt_id: (componente existente | None, nome novo, marca, potência W, rede, micro)
EXISTE = {
    36510: 'f53f94ff-4e01-4ab8-8473-b40960cc7a2c', 36511: '3f6ba5e4-2e2b-4f87-a59a-6094cddb0a6c',
    45221: '4593e049-1b08-4087-86d0-6ba176068f14', 45222: '676c2a4e-1b37-48a0-98cf-52e071f052fc',
    45223: '930eb0b1-acbf-459c-b67c-b3ad75531e01', 45224: '5b65dee4-2c33-4117-9889-63448ccde257',
    228: '6608cc1a-6e6d-474f-ba5f-6024a5652e41', 229: '84385f24-8f7f-444e-81a0-6828970baa70',
    231: '0d88e2c8-c1c9-4c1c-bdf6-ad14fa035693', 45164: 'dfe536a2-9947-4123-a9e4-baf1426e9f6b',
    36514: 'd297a7fb-3926-40de-b92f-2840fe4502c3', 36515: 'ea3adbd4-90b5-4211-8505-1a02827200a8',
    39975: 'bcc52598-533a-4118-8619-763a9717d2c8', 39976: '72f09776-c962-47b3-8bd5-f634183748ec',
    63: '84af57ec-ed79-47bf-885f-aab0c0e15fac', 32599: '68d6d9a7-3fe7-4128-a4de-9486e58160a5',
    45242: '2b9a9eec-68af-4548-9bdb-10ec6b33fbcc',
}
NOVOS_INV = {
    36509: ('AUXSOL ASN-3.3SL', 'AUXSOL', 3300, 'mono_220'),
    45209: ('AUXSOL ASN-7.3SL-G2-PRO', 'AUXSOL', 7300, 'mono_220'),
    45210: ('AUXSOL ASN-10.5SL', 'AUXSOL', 10500, 'mono_220'),
    39967: ('AUXSOL ASN-20TL TRI 380V', 'AUXSOL', 20000, 'tri_380'),
    39968: ('AUXSOL ASN-25TL TRI 380V', 'AUXSOL', 25000, 'tri_380'),
    45225: ('HYXIPOWER HYX-10K-S', 'HYXIPOWER', 10000, 'mono_220'),
    9546: ('SOFAR 3.3KTL2-G3', 'SOFAR', 3300, 'mono_220'),
    32617: ('SOFAR 4KTL2-G3', 'SOFAR', 4000, 'mono_220'),
    45231: ('SOFAR 7.3KTLM-G3', 'SOFAR', 7300, 'mono_220'),
    232: ('SOFAR 15KTLX-G3-LV TRI 220V', 'SOFAR', 15000, 'tri_220'),
    233: ('SOFAR 20KTLX-G3-LV TRI 220V', 'SOFAR', 20000, 'tri_220'),
    234: ('SOFAR 25KTLX-G3-LV TRI 220V', 'SOFAR', 25000, 'tri_220'),
    1560: ('SOFAR 30KTLX-G3-LV TRI 220V', 'SOFAR', 30000, 'tri_220'),
    238: ('SOFAR 50KTLX-G3 TRI 380V', 'SOFAR', 50000, 'tri_380'),
    163: ('SOLIS 100K-5G-PRO TRI 380V', 'SOLIS', 100000, 'tri_380'),
    45160: ('SUNGROW SG3.0RS-L2', 'SUNGROW', 3000, 'mono_220'),
    45161: ('SUNGROW SG4.0RS-L2', 'SUNGROW', 4000, 'mono_220'),
    45162: ('SUNGROW SG5.0RS-L2', 'SUNGROW', 5000, 'mono_220'),
    45163: ('SUNGROW SG6.0RS-L2', 'SUNGROW', 6000, 'mono_220'),
    45165: ('SUNGROW SG8.0RS-L2', 'SUNGROW', 8000, 'mono_220'),
    39974: ('SUNGROW SG10RS-L', 'SUNGROW', 10000, 'mono_220'),
    39977: ('SUNGROW SG25CX-P2-LV TRI 220V', 'SUNGROW', 25000, 'tri_220'),
    39978: ('SUNGROW SG50CX-P2-LV TRI 220V', 'SUNGROW', 50000, 'tri_220'),
    39979: ('SUNGROW SG75CX-LV TRI 220V', 'SUNGROW', 75000, 'tri_220'),
    45167: ('SUNGROW SG25CX-P2 TRI 380V', 'SUNGROW', 25000, 'tri_380'),
    1387: ('SUNGROW SG40CX-P2 TRI 380V', 'SUNGROW', 40000, 'tri_380'),
    45168: ('SUNGROW SG50CX-P2 TRI 380V', 'SUNGROW', 50000, 'tri_380'),
    39980: ('SUNGROW SG75CX-P2 TRI 380V', 'SUNGROW', 75000, 'tri_380'),
    39985: ('SUNGROW SG110CX-P2 TRI 380V', 'SUNGROW', 110000, 'tri_380'),
    45154: ('Microinversor HYXIPOWER HYX-M2500D-SW', 'HYXIPOWER', 2500, 'mono_220'),
}
NOVOS_MOD = {
    45220: ('MÓDULO OSDA ODA620-33V-MHDRZ 620W', 'OSDA', 620),
    45264: ('MÓDULO HANERSUN 600W N-TYPE BIFACIAL', 'HANERSUN', 600),
    45227: ('MÓDULO ZNSHINE 650W N-TYPE BIFACIAL', 'ZNSHINE', 650),
    45239: ('MÓDULO LEAPTON 720W N-TYPE BIFACIAL', 'LEAPTON', 720),
}
CURTO_MOD = {45242: 'TCL', 45220: 'OSDA', 45264: 'HANERSUN', 45227: 'ZNSHINE', 45239: 'LEAPTON'}

def comp_id(avt):
    return EXISTE.get(avt) or uid(f'componente:avt:{avt}')

def kw_inv(avt):
    if avt in NOVOS_INV: return NOVOS_INV[avt][2]
    m = {36510: 5000, 36511: 6000, 45221: 3600, 45222: 5000, 45223: 6000, 45224: 7300, 228: 5000, 229: 6000, 231: 10000,
         45164: 7500, 36514: 15000, 36515: 20000, 39975: 15000, 39976: 20000, 63: 25000, 32599: 2000}
    return m[avt]

def marca_inv(avt):
    if avt in NOVOS_INV: return NOVOS_INV[avt][1]
    nome = INVS[avt]['nome']
    return 'HYXIPOWER' if 'HYX' in nome else next(m for m in ['SOFAR', 'AUXSOL', 'SUNGROW', 'SOLIS'] if m in nome)

def kw_txt(w):
    k = w / 1000
    return (('%g' % k).replace('.', ',')) + 'KW'

def q(s): return "'" + str(s).replace("'", "''") + "'"
def js(o): return q(json.dumps(o, ensure_ascii=False, separators=(',', ':')))

# faixa de kWp por inversor (1 unidade): menor mínimo e menor máximo entre os painéis
def faixa(inv):
    mins, maxs = [], []
    for k, (a, b, _) in inv['faixa'].items():
        idp = k.split('/')[0]; wp = S['painel'][idp]['wp']
        mins.append(round(a * wp / 1000, 2)); maxs.append(round(b * wp / 1000, 2))
    return [min(mins), min(maxs)] if mins else None

# ---------- estruturas: placas × A + ceil(placas/G) × B ----------
TEL = {0: ('ceramico', 'Cerâmico / colonial', 19, 10), 1: ('fibro_madeira', 'Fibrocimento · estrutura de madeira', 19, 30),
       8: ('fibro_metal', 'Fibrocimento · estrutura metálica', 19, 20), 4: ('trapezoidal', 'Metálico trapezoidal', 20, 40),
       7: ('mini_trilho', 'Metálico · mini trilho', 19, 50), 5: ('laje', 'Laje', 15, 90), 6: ('solo', 'Solo', 13, 100),
       12: ('kalhetao', 'Kalhetão', 19, 70)}
TEL_ALTO = (4, 22, 'mini_trilho_alto', 'Metálico · mini trilho alto', 60)

def ajusta(pontos):
    for G in (4, 8, 3):
        if 1 not in pontos or (G + 1) not in pontos: continue
        A = round((pontos[G + 1] - 2 * pontos[1]) / (G - 1), 4)
        B = round(pontos[1] - A, 4)
        if all(abs(n * A + math.ceil(n / G) * B - v) < 0.011 for n, v in pontos.items()):
            return G, round(A, 2), round(B, 2)
    return None

estruturas = []
for idp, tam in ((45242, 1), (45239, 2)):
    itens = [(t, *TEL[t]) for t in TEL] + [(TEL_ALTO[0], TEL_ALTO[2], TEL_ALTO[3], TEL_ALTO[1], TEL_ALTO[4])]
    for tel, chave, nome, forn, ordem in itens:
        pts = {}
        for key, lst in D['est'].items():
            p, t, n, mic = key.split('|')
            if int(p) != idp or int(t) != tel or mic != '0' or not isinstance(lst, list): continue
            for f in lst:
                if f[0] == forn or (tam == 2 and chave == 'solo' and f[0] == 23):
                    pts[int(n)] = f[2]
        r = ajusta(pts)
        if not r:
            print('estrutura sem ajuste', idp, chave, sorted(pts.items())[:6]); continue
        G, A, B = r
        micro_ok = any(isinstance(D['est'].get(f'{idp}|{tel}|{n}|1'), list) and D['est'][f'{idp}|{tel}|{n}|1'] for n in (4, 8, 10))
        estruturas.append({'id': f'avt_{chave}_{tam}', 'telhado': chave, 'nome': nome, 'tam': tam, 'G': G, 'A': A, 'B': B,
                           'padrao': chave == 'ceramico', 'micro_bloq': not micro_ok, 'ordem': ordem + 5, 'n': len(pts), 'forn': forn})
for e in estruturas:
    print('estrutura', e['id'], 'G', e['G'], 'placa', e['A'], 'grupo', e['B'], 'pontos', e['n'], 'bloqueia_micro', e['micro_bloq'])

# confere a estrutura padrão contra a fileira das cotações (cerâmico)
for idp, tam in ((45242, 1), (45220, 1), (45264, 1), (45227, 1), (45239, 2)):
    e = next(x for x in estruturas if x['id'] == f'avt_ceramico_{tam}')
    erro = max((abs(int(k.split('|')[1]) * e['A'] + math.ceil(int(k.split('|')[1]) / e['G']) * e['B'] - v['vt'] + (
        sum(i[1] * i[2] for i in v.get('itens', []) if i[0] == 32613) if k.endswith('|1') else 0))
               for k, v in S['fil'].items() if k.startswith(f'{idp}|') and v.get('itens') is not None), default=0)
    vistos = sum(1 for k, v in S['fil'].items() if k.startswith(f'{idp}|') and v.get('itens') is not None)
    print('cerâmico padrão x fileira', idp, 'erro máx', round(erro, 2), 'fileiras', vistos)

# ---------- regras ----------
REGRAS = {'modo': 'calculo',
          'cabo': {'tipo': 'rolo', 'mono': {'mm': 4, 'preco_m': 5, 'rolos': [25, 50, 75, 100]}, 'tri': {'mm': 6, 'preco_m': 6, 'rolos': [25, 50, 100]}},
          'conector_par': 12.60, 'conector_nome': 'Kit 2 pares de conectores MC4', 'conectores_micro': 'placa',
          'fix_micro': 6.30, 'placas_por_micro': 4, 'tensoes': ['220', '380'], 'kw_max': 110,
          'frete_padrao': FRETE['Aracatuba'], 'avt': {'cd': 'TRÊS LAGOAS - MS', 'coleta': '2026-10-27'}}

def faixas_sql(r):
    return {'da': r['da'], 'minimo': r['minimo'], 'faixas': [[l, p] for l, p in r['faixas']]}

base = []
base.append('-- AVT Energy: distribuidora de cálculo (igual à Helte). Coleta no portal da AVT em 27/10/2026, CD Três Lagoas-MS.')
base.append('-- Gerado por outputs/avt-20261027/gerar_sql_avt.py. Idempotente (ids fixos; on conflict).')
base.append(f"insert into public.distribuidoras (id, nome, ativo, regras_kit) values ({q(AVT)}, 'AVT Energy', true, {js(REGRAS)}::jsonb)\n"
            "  on conflict (id) do update set regras_kit = excluded.regras_kit;")
# componentes novos
vals = []
for avt, (nome, marca, w, rede) in NOVOS_INV.items():
    micro = 'Microinversor' in nome
    ficha = {'potencia': w, 'rede': rede, 'micro': micro, 'hibrido': False, 'avt_id': avt}
    vals.append(f"({q(comp_id(avt))}, 'inversor', {q(nome)}, {w}, 0, true, {q(marca)}, 'un', {js(ficha)}::jsonb, false)")
for avt, (nome, marca, w) in NOVOS_MOD.items():
    vals.append(f"({q(comp_id(avt))}, 'modulo', {q(nome)}, {w}, 0, true, {q(marca)}, 'un', {js({'potencia': w, 'avt_id': avt})}::jsonb, false)")
base.append('insert into public.componentes (id, tipo, nome, potencia_wp, preco_unitario, ativo, marca, unidade, ficha, ficha_conferida) values\n  '
            + ',\n  '.join(vals) + '\n  on conflict (id) do nothing;')
base.append("update public.componentes set ativo = true where id = '84af57ec-ed79-47bf-885f-aab0c0e15fac'; -- SOLIS S5-GC25K 380V (era só Helte, inativo)")
# ofertas
of = []
for avt, inv in INVS.items():
    ficha = {'avt_id': avt}
    if 'micro' not in inv['modos']:
        ficha['pares_conector'] = int(inv['k1'][0]) if len(inv['k1']) == 1 else int(min(inv['k1']))
        fx = faixa(inv)
        if fx: ficha['faixa_kwp'] = fx
    of.append(f"({q(AVT)}, {q(comp_id(avt))}, {PU[avt]['preco']}, true, {js(ficha)}::jsonb)")
for idp, info in S['painel'].items():
    of.append(f"({q(AVT)}, {q(comp_id(int(idp)))}, {info['preco']}, true, {js({'avt_id': int(idp)})}::jsonb)")
base.append('insert into public.distribuidora_componentes (distribuidora_id, componente_id, preco_unitario, ativo, ficha) values\n  '
            + ',\n  '.join(of) + '\n  on conflict (distribuidora_id, componente_id) do update set preco_unitario = excluded.preco_unitario, ativo = true, ficha = excluded.ficha;')
# estruturas
ev = []
for e in estruturas:
    det = {'avt_fornecedor_estrutura': e['forn'], 'regra': f"{e['A']} por placa + {e['B']} a cada {e['G']} placas"}
    ev.append(f"({q(e['id'])}, {q(AVT)}, {q(e['telhado'])}, {q(e['nome'])}, 'standard', {e['tam']}, 'grupo', {e['A']}, {e['G']}, {e['B']}, "
              f"{'true' if e['padrao'] else 'false'}, {'true' if e['micro_bloq'] else 'false'}, {e['ordem']}, {js(det)}::jsonb)")
base.append('insert into public.estruturas (id, distribuidora_id, telhado, telhado_nome, linha, tamanho, modo, custo_placa, placas_mesa, custo_mesa, padrao, bloqueia_micro, ordem, detalhe) values\n  '
            + ',\n  '.join(ev) + '\n  on conflict (id) do update set custo_placa = excluded.custo_placa, placas_mesa = excluded.placas_mesa, custo_mesa = excluded.custo_mesa, detalhe = excluded.detalhe;')
# frete por unidade
fv = [f"({q(AVT)}, {q(FRANQ[c])}, 0, 0, {js(faixas_sql(r))}::jsonb, {q('AVT · ' + c + ' · conferido 27/10/2026')})" for c, r in FRETE.items()]
base.append('insert into public.frete_regra_unidade (distribuidora_id, franquia_id, pct_ate, pct_acima, regra, observacao) values\n  '
            + ',\n  '.join(fv) + '\n  on conflict (distribuidora_id, franquia_id) do update set regra = excluded.regra, observacao = excluded.observacao, atualizado_em = now();')
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, '20261027_avt_1_base.sql'), 'w', encoding='utf-8').write('\n\n'.join(base) + '\n')

# ---------- kits (compacto: o banco monta nome, descrição, custo e detalhe) ----------
MODO = {'mono': 'm', 'tri220': 't', 'micro': 'u'}
linhas = sorted(([k['painel'], k['n'], k['inv'], k['q'], k['pecas'], MODO[k['modo']]] for k in KITS), key=lambda x: (x[0], x[1], x[5], x[2]))
SQL_KITS = """-- Kits AVT do catálogo, parte {parte}: {n} kits ([painel AVT, placas, inversor AVT, qtd inversores, peças R$, m=mono t=tri u=micro]).
-- Custo = peças + frete da AVT em Araçatuba (frete_padrao); nome/descrição no padrão dos kits da Helte, com a marca do módulo.
with d as (
  select (x->>0)::int pav, (x->>1)::int n, (x->>2)::int iav, (x->>3)::int q, (x->>4)::numeric pecas, x->>5 modo
    from jsonb_array_elements({dados}::jsonb) x
), k as (
  select d.*, cm.id modulo_id, cm.potencia_wp::int wp, ci.id inversor_id, ci.nome inv_nome, upper(ci.marca) marca,
         replace(trim_scale(ci.potencia_wp / 1000)::text, '.', ',') || 'KW' kw,
         (array['TCL','OSDA','HANERSUN','ZNSHINE','LEAPTON'])[array_position(array[45242,45220,45264,45227,45239], d.pav)] mod,
         round(d.pecas + private.frete_distribuidora('{avt}', null, d.pecas), 2) custo
    from d
    join public.distribuidora_componentes dm on dm.distribuidora_id = '{avt}' and (dm.ficha->>'avt_id')::int = d.pav
    join public.componentes cm on cm.id = dm.componente_id
    join public.distribuidora_componentes di on di.distribuidora_id = '{avt}' and (di.ficha->>'avt_id')::int = d.iav
    join public.componentes ci on ci.id = di.componente_id
), n as (
  select k.*, case when modo = 'u' then format('KIT %s MOD. %s %sW + MICROINVERSOR %s %s', n, mod, wp, marca, kw)
                   else format('KIT %s MOD. %s %sW + INV. %s %s', n, mod, wp, marca, kw) end nome,
         case when modo = 'u' then format('%s módulos %s de %sW e %s microinversores %s %s', n, mod, wp, q, marca, kw)
              else format('%s módulos %s de %sW e INVERSOR %s %s | 220 V', n, mod, wp, marca, kw) end descricao
    from k
), ins as (
  insert into public.produtos (categoria, name, brand, power, price, list_price, type, tag, description, franquia_id, ativo,
                               modulo_id, modulo_qtd, inversor_id, inversor_qtd, distribuidora_id, linha)
  select case when n.modo = 'u' then 'kitsMicro' else 'kitsInversor' end, n.nome, 'MÓDULOS N-TYPE', round(n.n * n.wp / 1000.0, 2),
         p.preco, private.cc_preco_de(p.preco), case when n.modo = 't' then 'Trifásico' else 'Bifásico' end, 'MAIS VENDIDO', n.descricao,
         '{matriz}', true, n.modulo_id, n.n, n.inversor_id, n.q, '{avt}', 'catalogo'
    from n cross join lateral (select private.cc_preco_markup(n.custo, n.modo = 'u') preco) p
   where not exists (select 1 from public.produtos x where x.name = n.nome)
  returning id, name
)
insert into public.produtos_custo (produto_id, custo, fonte, detalhe)
select i.id, n.custo, 'avt', jsonb_build_object('data', '2026-10-27', 'pecas', n.pecas, 'frete', n.custo - n.pecas, 'inversor', n.inv_nome,
       'modulo', n.mod || ' ' || n.wp || 'W', 'estrutura', 'AVT cerâmico', 'avt_inversor', n.iav, 'modo', n.modo)
  from ins i join n on n.nome = i.name;
"""
partes = [linhas[i:i + 760] for i in range(0, len(linhas), 760)]
for idx, parte in enumerate(partes, 1):
    txt = SQL_KITS.format(parte=idx, n=len(parte), dados=q(json.dumps(parte, separators=(',', ':'))), matriz=MATRIZ, avt=AVT)
    open(os.path.join(OUT, f'20261027_avt_2_kits_parte{idx}.sql'), 'w', encoding='utf-8').write(txt)
    print('kits parte', idx, len(parte), 'bytes', len(txt))
PRECOS = f"""-- Preço dos kits AVT nas unidades com o catálogo completo (Matriz e Goiânia), pela regra com o frete da AVT de cada uma.
insert into public.precos_franquia (produto_id, franquia_id, price, list_price)
select p.id, f.id, x.preco, private.cc_preco_de(x.preco)
  from public.produtos p cross join (values ('{MATRIZ}'::uuid), ('{GOIANIA}'::uuid)) f(id)
  cross join lateral (select private.cc_preco_markup(private.cc_custo_kit(p.id, f.id), p.categoria = 'kitsMicro') preco) x
 where p.distribuidora_id = '{AVT}' and p.ativo and x.preco > 0
on conflict (produto_id, franquia_id) do update set price = excluded.price, list_price = excluded.list_price;
select private.cc_aplicar_precos('{MATRIZ}'), private.cc_aplicar_precos('{GOIANIA}');
"""
open(os.path.join(OUT, '20261027_avt_3_precos.sql'), 'w', encoding='utf-8').write(PRECOS)
print('AVT id', AVT)
