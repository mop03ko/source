import {roles} from './crm';
export const roleGroups=[
 {label:'Удирдах эрх',roles:['admin','director','manager']},
 {label:'Борлуулалт ба үйлчилгээ',roles:['agent','operator']},
 {label:'Мэргэжлийн ажил',roles:['marketing','it','delivery']},
];
export const roleDescriptions:Record<string,string>={
 admin:'Гишүүний эрх, системийн тохиргоо, тайлан, төсөв болон агуулахын барааны мэдээллийг удирдана.',
 director:'Багийн эрх, үйл ажиллагааны тайлан, төсвийн шийдвэрийг хянана. Зээлийн хүсэлт өөрт нь хуваарилагдахгүй. «Бүх ажилчид» чатанд орохгүй.',
 manager:'Багийн ажлын хуваарь, хүсэлтийн хуваарилалт, агуулахын барааны мэдээллийг удирдана. Гишүүний эрх олгохгүй.',
 agent:'Өөрт хуваарилагдсан зээлийн хүсэлттэй ажиллана. Ажлын хуваарьтай өдөр ухаалаг хуваарилалтаар хүсэлт авна.',
 operator:'Бүх зээлийн хүсэлтийг харж, мэдээлэл засна. Өөрт нь хүсэлт оноохгүй; ухаалаг хуваарилалтад орохгүй.',
 marketing:'Маркетингийн ажлын модульд ажиллана. Зээлийн хүсэлттэй ажиллахгүй.',
 it:'IT ажлын модульд ажиллана. Зээлийн хүсэлттэй ажиллахгүй.',
 delivery:'Өөрийн хүргэлтийг харж, хүргэлтийн төлөв шинэчилнэ. Зээлийн хүсэлттэй ажиллахгүй.',
};
export const roleCategory=(role:string)=>roleGroups.find(group=>group.roles.includes(role))?.label||'Бусад';
export const memberRoleOptions=roleGroups.map(group=>({label:group.label,options:group.roles.map(value=>({value,label:roles[value]}))}));
