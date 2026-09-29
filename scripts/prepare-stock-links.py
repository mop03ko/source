"""Conservative one-to-one stock mapping from live catalog exports. Does not execute SQL."""
import collections,csv,json,sys
from pathlib import Path
root=Path(sys.argv[1])
site=[json.loads(line) for line in (root/'site.jsonl').read_text(encoding='utf8').splitlines()]
crm=[json.loads(line) for line in (root/'crm.jsonl').read_text(encoding='utf8').splitlines()]
def norm(value): return ' '.join(value.upper().split())
def key(row): return tuple(norm(row[field]) for field in ('name','capacity','color'))
si=collections.defaultdict(list); ci=collections.defaultdict(list)
for row in site: si[key(row)].append(row)
for row in crm: ci[key(row)].append(row)
links=[]
for k,rows in ci.items():
    if len(rows)!=1 or len(si[k])!=1: continue
    c,s=rows[0],si[k][0]
    # Extra condition/version descriptors require manual review.
    if norm(c['variant']) not in ('',norm(' / '.join(v for v in (c['capacity'],c['color']) if v))): continue
    links.append((c,s))
def sql(value): return "CONVERT(0x"+str(value).encode().hex()+" USING utf8mb4)" if str(value) else "''"
statements=['START TRANSACTION;']
for c,s in links:
    values=[s['id'],s['code'],s['name'],s['capacity'],s['color'],'']
    statements.append('INSERT INTO site_catalog(id,code,name,capacity,color,variant,imported_at) VALUES('+','.join(map(sql,values))+",DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%dT%H:%i:%s.000Z'));")
    statements.append('INSERT INTO site_stock_links(product_key,site_id,site_code,enabled,confirmed_by,confirmed_at) VALUES('+','.join(map(sql,[c['key'],s['id'],s['code']]))+",1,'exact-name-capacity-color',DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%dT%H:%i:%s.000Z'));")
statements.append('COMMIT;')
(root/'links.sql').write_text('\n'.join(statements),encoding='utf8')
(root/'matched.json').write_text(json.dumps([{'crm':c,'site':s} for c,s in links],ensure_ascii=False,indent=2),encoding='utf8')
matched={s['id']:c for c,s in links}
with (root/'stock-mapping-review.csv').open('w',encoding='utf-8-sig',newline='') as out:
    writer=csv.writer(out)
    writer.writerow(['Site ID','Site code','Name','Capacity','Color','Status','CRM product key'])
    for s in site:
        c=matched.get(s['id'])
        writer.writerow([s['id'],s['code'],s['name'],s['capacity'],s['color'],'Matched' if c else 'Review required',c['key'] if c else ''])
print(json.dumps({'site_products':len(site),'crm_groups':len(crm),'exact_links':len(links),'site_review':len(site)-len(links)}))
