'use client';
import {useState} from 'react';
import {FileSpreadsheet, Printer} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {toast} from '@/components/ui/sonner';
import {downloadXlsx, printReport, type ReportDoc} from '@/lib/report-export';
// Тайлан бүрийн "Excel татах / PDF хэвлэх" хос товч. doc()-ийг дарах үед л дуудна — тайлан ачаалагдаагүй
// байхад дата хэлбэржүүлэхгүй.
export function ReportExport({doc, disabled}: {doc: () => ReportDoc; disabled?: boolean}) {
  const [busy, setBusy] = useState(false);
  const run = async (kind: 'xlsx' | 'pdf') => {
    setBusy(true);
    try {
      const built = doc();
      if (!built.sheets.some((s) => s.rows.length)) throw new Error('Татах мэдээлэл алга.');
      if (kind === 'xlsx') await downloadXlsx(built);
      else printReport(built);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row">
      <Button variant="outline" size="sm" disabled={disabled || busy} onClick={() => run('xlsx')}>
        <FileSpreadsheet size={15} />
        Excel
      </Button>
      <Button variant="outline" size="sm" disabled={disabled || busy} onClick={() => run('pdf')}>
        <Printer size={15} />
        PDF
      </Button>
    </div>
  );
}
