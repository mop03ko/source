'use client';
import {Checkbox} from 'antd';
import {Button} from '@/components/ui/button';

export function BulkSelectionBar({count,total,all,mixed,disabled,label,onAll,onClear,onExport}:{count:number;total:number;all:boolean;mixed:boolean;disabled:boolean;label:string;onAll:(checked:boolean)=>void;onClear:()=>void;onExport:()=>void}){
 return <div className="bulk-selection-bar">
  <Checkbox checked={all} indeterminate={mixed} disabled={disabled||!total} onChange={e=>onAll(e.target.checked)}>Энэ хуудсыг сонгох</Checkbox>
  <span role="status" aria-live="polite">{count} {label} сонгосон / {total}</span>
  <Button size="sm" variant="outline" disabled={disabled||!count} onClick={onExport}>Сонгосныг CSV татах</Button>
  <Button size="sm" variant="ghost" disabled={!count} onClick={onClear}>Сонголт цэвэрлэх</Button>
  <small>Хуудас, шүүлтүүр солиход сонголт цэвэрлэгдэнэ.</small>
 </div>;
}
