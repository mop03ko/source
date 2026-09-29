"""Remove the earlier stock integration from product cards without changing detail pages."""
from pathlib import Path
import sys

path=Path(sys.argv[1])/'components/product/ProductGridCard.tsx'
text=path.read_text(encoding='utf8')
for line in ['import {CrmStock} from "./crm-stock";\n','        <div className="px-3.5 pb-3"><CrmStock id={String(product.product_id)} /></div>\n']:
    assert text.count(line)==1, 'Expected stock card integration was not found'
    text=text.replace(line,'')
path.write_text(text,encoding='utf8')
