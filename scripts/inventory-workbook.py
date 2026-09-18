"""Convert cached Balance values to a reviewable opening-stock CSV. Never writes a database.
Usage: python scripts/inventory-workbook.py source.xlsx --out artifacts/inventory-import
"""
import argparse, csv, datetime, json, re, zipfile
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import xml.etree.ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def workbook(path):
    with zipfile.ZipFile(path) as archive:
        strings = [''.join(t.text or '' for t in si.iter('{'+NS['s']+'}t')) for si in ET.fromstring(archive.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in archive.namelist() else []
        rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        result = {}
        for sheet in ET.fromstring(archive.read('xl/workbook.xml')).find('s:sheets', NS):
            target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            root = ET.fromstring(archive.read(target.lstrip('/') if target.startswith('/') else 'xl/'+target))
            rows = []
            for row in root.findall('s:sheetData/s:row', NS):
                cells = {}
                for cell in row:
                    value = cell.find('s:v', NS)
                    value = value.text if value is not None else ''
                    if cell.attrib.get('t') == 's': value = strings[int(value)] if value else ''
                    elif cell.attrib.get('t') == 'inlineStr': value = ''.join(t.text or '' for t in cell.findall('.//s:t', NS))
                    if value: cells[re.sub(r'\d', '', cell.attrib['r'])] = value
                if cells: rows.append((int(row.attrib['r']), cells))
            result[sheet.attrib['name']] = rows
        return result

def money(value):
    return str(Decimal(value or '0').quantize(Decimal('.01'), rounding=ROUND_HALF_UP))

def identifier(value):
    if re.fullmatch(r'\d+(\.\d+)?[Ee][+\-]?\d+|\d+\.0+', value or ''):
        return format(Decimal(value), '.0f')
    return value.strip()

def convert(source, destination):
    sheets = workbook(source)
    if 'Balance' not in sheets: raise ValueError('Balance sheet олдсонгүй.')
    fields = ['code','brand','supplier','name','capacity','color','imei','warehouse','qty','unit_cost','total_cost','sale_price','variant','min_stock']
    output, issues, seen = [], [], set()
    for number, r in sheets['Balance']:
        if number <= 2: continue
        if not r.get('B') and not r.get('D'): continue  # formatting / formula-only trailing rows
        if not all(r.get(k) for k in ['B','D','H']):
            issues.append({'row':number,'reason':'Код, нэр эсвэл агуулах дутуу','code':r.get('B','')}); continue
        try:
            qty = Decimal(r.get('P','0'))
            if qty < 0 or qty != int(qty): raise ValueError('Үлдэгдэл сөрөг эсвэл бүхэл бус')
            code = identifier(r['B'])
            if code in seen: raise ValueError('Код давхардсан')
            total = money(r.get('R','0'))
            if any(Decimal(money(r.get(k,'0'))) < 0 for k in ['Q','R','S']): raise ValueError('Өртөг / үнэ сөрөг')
            if qty == 0 and Decimal(total) != 0: raise ValueError('Тэг үлдэгдэлтэй боловч өртөгтэй')
            output.append(dict(zip(fields,[code,r.get('C','').strip(),r.get('C','').strip(),r['D'].strip(),r.get('E',''),r.get('F',''),identifier(r.get('G','')),r['H'].strip(),int(qty),money(r.get('Q','0')),total,money(r.get('S','0')),'',0])))
            seen.add(code)
        except (ValueError, ArithmeticError) as error:
            issues.append({'row':number,'reason':str(error),'code':r.get('B','')})
    destination.mkdir(parents=True, exist_ok=True)
    with (destination/'opening-stock.csv').open('w',encoding='utf-8-sig',newline='') as handle:
        writer=csv.DictWriter(handle,fieldnames=fields);writer.writeheader();writer.writerows(output)
    first=sheets['Balance'][0][1]; serial=Decimal(first.get('R',first.get('Q','0')))
    as_of=(datetime.datetime(1899,12,30)+datetime.timedelta(days=float(serial))).isoformat()+'+08:00'
    summary={'source':source.name,'sheets':[{'name':name,'nonempty_rows':len(rows)} for name,rows in sheets.items()], 'as_of_exclusive':as_of,'products':len(output),'positive_products':sum(r['qty']>0 for r in output),'units':sum(r['qty'] for r in output),'value':str(sum(Decimal(r['total_cost']) for r in output)),'warehouses':dict(Counter(r['warehouse'] for r in output)),'issues':issues,'note':'Cached Balance closing values only. Historical Purchase/Sales rows are not replayed. Review issues and as-of date before import.'}
    (destination/'review.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in summary.items() if k!='sheets'},ensure_ascii=False))
    return summary

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();convert(args.source,args.out)
