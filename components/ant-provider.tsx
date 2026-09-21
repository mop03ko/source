'use client';
import {App, ConfigProvider} from 'antd';
import mnMN from 'antd/locale/mn_MN';
import type {ReactNode} from 'react';

export function AntProvider({children}:{children:ReactNode}) {
  return <ConfigProvider locale={mnMN} theme={{token:{colorPrimary:'#a94706',borderRadius:8,controlHeight:38,fontFamily:'Arial, Helvetica, sans-serif'},components:{Button:{fontWeight:500},Table:{headerBg:'#faf9fc'},Tabs:{horizontalMargin:'0 0 16px 0'}}}}><App>{children}</App></ConfigProvider>;
}
