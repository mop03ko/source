import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'AntMall CRM — Дотоод ажлын орчин',description:'AntMall багийн хүсэлт, холбоо барилт, Recycle хөтөлбөрийн нэгдсэн орчин.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="mn"><body>{children}</body></html>;}
