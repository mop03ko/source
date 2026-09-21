"""Extract the supplied price workbook, preserving merged names/notes and exact prices."""
import argparse, importlib.util, json, re, zipfile, hashlib
from pathlib import Path
from decimal import Decimal
import xml.etree.ElementTree as ET

def extract(path):
    spec=importlib.util.spec_from_file_location('inventory_workbook',Path(__file__).with_name('inventory-workbook.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    sheets=module.workbook(path)
    if len(sheets)!=1: raise ValueError('Expected one price sheet')
    sheet,values=next(iter(sheets.items())); cells=dict(values)
    if cells[1].get('F')!='Үндсэн үнэ' or cells[1].get('G')!='Хямдралтай үнэ': raise ValueError('Unexpected price columns')
    with zipfile.ZipFile(path) as z:
        root=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        for merged in root.findall('s:mergeCells/s:mergeCell',module.NS):
            match=re.fullmatch(r'([A-Z]+)(\d+):([A-Z]+)(\d+)',merged.attrib['ref'])
            col,start,_,end=match.groups(); start,end=int(start),int(end)
            if col not in ['A','C','J']: continue
            value=cells.get(start,{}).get(col)
            if value:
                for n in range(start,end+1):
                    if n in cells: cells[n].setdefault(col,value)
    rows=[]
    for number,c in cells.items():
        if number==1 or not c.get('C'): continue
        issues=[]
        def amount(key):
            if not c.get(key): return None
            d=Decimal(c[key])
            if not d.is_finite() or d<=0 or d>1_000_000_000 or d*100!=(d*100).to_integral_value():
                issues.append('Үнэ буруу: '+key);return None
            return float(d)
        base,cash=amount('F'),amount('G')
        if base is None: issues.append('Үндсэн үнэ байхгүй')
        if cash is not None and base is not None and cash>base: issues.append('Хямдралтай үнэ үндсэн үнээс их')
        note=c.get('J','').strip()
        # Do not silently replace per-channel/approval/supplier rules with a generic two-price policy.
        if re.search(r'Gnext|зөвшөөрөл|\d[\d,]*,\d{3}|Tabtai|бэлэггүй',note,re.I): issues.append('Тусгай үнийн нөхцөлтэй')
        if re.search(r'бэлэг|бэлгэнд|тавцан,\s*хөл',c['C'],re.I): issues.append('Бэлэг / багцын нөхцөлтэй')
        rows.append(dict(row=number,section=c.get('A',''),name=c['C'],model=c.get('D',''),base=base,cash=cash,note=note,issues=issues))
    return dict(source=str(Path(path).resolve()),sha256=hashlib.sha256(Path(path).read_bytes()).hexdigest(),sheet=sheet,rows=rows)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('file');p.add_argument('--out',default='artifacts/price-update/prices.json');args=p.parse_args()
    data=extract(args.file);out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'rows':len(data['rows']),'flagged':sum(bool(r['issues']) for r in data['rows']),'out':str(out)}))
