'use client';
import * as React from 'react';
import {Layout,Menu,Drawer} from 'antd';
import {PanelLeft} from 'lucide-react';
import {useIsMobile} from '@/hooks/use-mobile';
import {Button} from './button';
const Context=React.createContext({open:true,mobile:false,mobileOpen:false,setMobileOpen:(_value:boolean)=>{},toggle:()=>{}});
export function SidebarProvider({children,...props}:React.ComponentProps<'div'>){
 const mobile=useIsMobile(),[open,setOpen]=React.useState(true),[mobileOpen,setMobileOpen]=React.useState(false);
 const toggle=React.useCallback(()=>{if(mobile)setMobileOpen(value=>!value);else setOpen(value=>!value);},[mobile]);
 React.useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='b'&&(e.ctrlKey||e.metaKey)){e.preventDefault();toggle();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[toggle]);
 return <Context.Provider value={{open,mobile,mobileOpen,setMobileOpen,toggle}}><Layout {...props} data-slot="sidebar-wrapper" className={`crm-ant-layout ${props.className??''}`}>{children}</Layout></Context.Provider>;
}
export function Sidebar({children,className,...props}:React.ComponentProps<'div'>){
 const ctx=React.useContext(Context);
 const content=<div {...props} data-slot="sidebar-inner" className={`crm-ant-sidebar-inner ${className??''}`}>{children}</div>;
 if(ctx.mobile)return <Drawer open={ctx.mobileOpen} placement="left" onClose={()=>ctx.setMobileOpen(false)} size={288} title="Ажлын цэс" styles={{body:{padding:0}}}>{content}</Drawer>;
 return <Layout.Sider width={248} collapsedWidth={0} collapsed={!ctx.open} theme="light" className="crm-ant-sider">{content}</Layout.Sider>;
}
export function SidebarInset(props:React.ComponentProps<'main'>){return <Layout.Content {...props}/>;}
export function SidebarHeader(props:React.ComponentProps<'div'>){return <div {...props} data-slot="sidebar-header"/>;}
export function SidebarFooter(props:React.ComponentProps<'div'>){return <div {...props} data-slot="sidebar-footer"/>;}
export function SidebarContent(props:React.ComponentProps<'div'>){return <div {...props} data-slot="sidebar-content" className={`crm-ant-sidebar-content ${props.className??''}`}/>;}
export function SidebarMenuItem({children}:React.ComponentProps<'li'>){return <>{children}</>;}
type MenuButtonProps=React.ComponentProps<typeof Button>&{isActive?:boolean};
export function SidebarMenuButton({isActive,...props}:MenuButtonProps){return <Button {...props} aria-current={isActive?'page':undefined}/>;}
export function SidebarMenu({children}:React.ComponentProps<'ul'>){
 const ctx=React.useContext(Context),selected:string[]=[];
 const items=React.Children.toArray(children).flatMap((child,index)=>{
  if(!React.isValidElement<{children?:React.ReactNode}>(child))return [];
  const button=React.Children.toArray(child.props.children).find(node=>React.isValidElement(node)&&node.type===SidebarMenuButton) as React.ReactElement<MenuButtonProps>|undefined;
  if(!button)return [];const key=String(child.key??index);if(button.props.isActive)selected.push(key);
  return [{key,label:<span className="crm-ant-menu-label">{button.props.children}</span>,className:button.props.className,disabled:button.props.disabled,onClick:({domEvent}:{domEvent:React.MouseEvent<HTMLElement>|React.KeyboardEvent<HTMLElement>})=>{button.props.onClick?.(domEvent as React.MouseEvent<HTMLButtonElement>);ctx.setMobileOpen(false);}}];
 });
 return <Menu mode="inline" selectedKeys={selected} items={items} className="crm-ant-menu"/>;
}
export function SidebarTrigger(props:React.ComponentProps<typeof Button>){const ctx=React.useContext(Context);return <Button type="button" variant="ghost" size="icon" {...props} data-slot="sidebar-trigger" aria-label="Цэс нээх, хаах" aria-expanded={ctx.mobile?ctx.mobileOpen:ctx.open} onClick={ctx.toggle}><PanelLeft size={18}/></Button>;}
