'use client';
import {useState} from 'react';
import {Alert,Select,Tag} from 'antd';
import {Field} from '@/components/form-field';
import {useUnsavedChanges} from '@/components/draft-guard';
import {canOwnLead,roles} from '@/lib/crm';
import {memberRoleOptions,roleCategory,roleDescriptions} from '@/lib/member-roles';
export default function MemberRoleField({initialRole='agent',disabled=false}:{initialRole?:string;disabled?:boolean}){
 const [role,setRole]=useState(initialRole);
 useUnsavedChanges(role!==initialRole);
 return <div className="member-role-field"><Field label="Олгох эрхийн төрөл"><Select aria-label="Олгох эрхийн төрөл" value={role} onChange={setRole} options={memberRoleOptions} disabled={disabled} showSearch={{optionFilterProp:'label'}} style={{width:'100%'}} aria-describedby="member-role-description"/><input type="hidden" name="role" value={role}/></Field>
 <div className="member-role-summary" id="member-role-description" aria-live="polite"><div className="row"><Tag>{roleCategory(role)}</Tag><strong>{roles[role]}</strong></div><p>{roleDescriptions[role]}</p><Tag color={canOwnLead(role)?'blue':'default'}>{canOwnLead(role)?'Зээлийн хүсэлт хариуцах боломжтой':'Зээлийн хүсэлт оноохгүй'}</Tag></div>
 {role==='operator'&&initialRole!==role&&<Alert type="info" showIcon title="Идэвхтэй хүсэлт хариуцаж байгаа ажилтны хүсэлтүүдийг шилжүүлсний дараа Оператор эрх олгоно."/>}
 <p className="form-help">Нэг гишүүнд нэг эрхийн төрөл сонгоно. Идэвхгүй болгосон гишүүн системд нэвтрэхгүй.</p></div>;
}
