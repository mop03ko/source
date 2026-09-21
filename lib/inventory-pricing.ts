export function salePrice(item:{sale_price:number;cash_price?:number|null}|null|undefined,mode:'cash'|'credit'){
 if(!item)return 0;
 return mode==='cash'&&item.cash_price!=null&&Number.isFinite(item.cash_price)&&item.cash_price>=0&&item.cash_price<=item.sale_price?item.cash_price:item.sale_price;
}
