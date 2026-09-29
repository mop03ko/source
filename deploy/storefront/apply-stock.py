"""Apply the display integration to a prepared storefront source snapshot."""
from pathlib import Path
import sys

root=Path(sys.argv[1])
templates=Path(sys.argv[2])
for template,target in [('stock-route.ts.txt','app/api/crm-stock/route.ts'),('crm-stock.tsx.txt','components/product/crm-stock.tsx')]:
    out=root/target
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text((templates/template).read_text(encoding='utf8'),encoding='utf8')

def edit(path, replacements):
    p=root/path
    text=p.read_text(encoding='utf8')
    for before,after in replacements:
        assert text.count(before)==1, (path,before)
        text=text.replace(before,after)
    p.write_text(text,encoding='utf8')

edit('components/product/ProductGridCard.tsx',[
 ('import Link from "next/link";', 'import Link from "next/link";\nimport {CrmStock} from "./crm-stock";'),
 ('{/* Wishlist */}', '{/* Wishlist */}'),
 ('{/* Зураг */}', '<div className="px-3 pt-3"><CrmStock id={String(product.product_id)} /></div>\n        {/* Зураг */}'),
])
edit('components/product/ProductDetailClient.tsx',[
 ('import Link from "next/link";', 'import Link from "next/link";\nimport {useCrmStock, StockMessage} from "./crm-stock";'),
 ('  const currentProduct = initialProduct;', '  const currentProduct = initialProduct;\n  const stockId = initialProduct?.has_variants ? String(selectedVariantPid ?? "") : String(initialProduct?.product?.id ?? "");\n  const crmStock = useCrmStock(stockId);'),
 ('  const currentAmount = hasVariants', '  const currentAmount = crmStock.status === "ready" ? crmStock.quantity ?? 0 : hasVariants'),
 ('  const showCartSection = !hasVariants || !hasVariantParam || currentAmount > 0;', '  const showCartSection = (hasVariants && !hasVariantParam) || currentAmount > 0;'),
 ('  const isCartDisabled = hasVariants && !hasVariantParam;', '  const isCartDisabled = (hasVariants && !hasVariantParam) || crmStock.status === "loading";'),
 ('          <CartSection', '          {stockId && <StockMessage stock={crmStock} />}\n\n          <CartSection\n            key={cartProductId}'),
 ('              amount={currentAmount}', '              amount={undefined}'),
])
edit('components/product/WarningMessage.tsx',[
 ('(!amount || amount === 0) && !promo_text', 'amount === 0'),
 ('          Сонгосон барааны үлдэгдэл дууссан байна дэлгүүрийн ажилтантай\n          <b> 72005588</b> утсаар холбогдоно уу', '          Үлдэгдэл цөөн байгаа тул та <a href="tel:72005588" className="font-bold underline">72005588</a> дугаараар холбогдож асууна уу.'),
])
