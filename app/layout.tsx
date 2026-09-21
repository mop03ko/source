import type {Metadata} from 'next';
import './globals.css';
import './antd.css';
import {DraftGuard} from '@/components/draft-guard';
import {AntdRegistry} from '@ant-design/nextjs-registry';
import {AntProvider} from '@/components/ant-provider';
export const metadata:Metadata={title:'AntMall CRM — Дотоод ажлын орчин',description:'AntMall багийн хүсэлт, холбоо барилт, Recycle хөтөлбөрийн нэгдсэн орчин.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="mn"><body><AntdRegistry><AntProvider><DraftGuard>{children}</DraftGuard></AntProvider></AntdRegistry></body></html>;}
