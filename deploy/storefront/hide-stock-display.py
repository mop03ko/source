"""Hide the stock panel while preserving internal quantity checks."""
from pathlib import Path
import sys

path=Path(sys.argv[1])/'components/product/ProductDetailClient.tsx'
text=path.read_text(encoding='utf8')
before='import {useCrmStock, StockMessage} from "./crm-stock";'
assert text.count(before)==1
text=text.replace(before,'import {useCrmStock} from "./crm-stock";')
before='          {stockId && <StockMessage stock={crmStock} />}\n'
assert text.count(before)==1
text=text.replace(before,'')
path.write_text(text,encoding='utf8')
