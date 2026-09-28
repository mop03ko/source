'use client';
import {Skeleton} from 'antd';
export function PageLoading(){return <div className="page-loading-skeleton" role="status" aria-label="Мэдээлэл ачаалж байна"><span className="sr-only">Мэдээлэл ачаалж байна…</span><Skeleton active title={{width:'35%'}} paragraph={{rows:2}}/><div className="page-loading-grid"><Skeleton active paragraph={{rows:5}}/><Skeleton active paragraph={{rows:5}}/></div></div>;}
