export function fenceStatements(tables){
 const quote=name=>'"'+name.replaceAll('"','""')+'"';
 return tables.flatMap(table=>['INSERT','UPDATE','DELETE'].map(event=>{
  const row=event==='DELETE'?'OLD':'NEW';
  const exception=table==='app_settings'?` AND ${row}."key"<>'migration_read_only'`:'';
  return `CREATE TRIGGER IF NOT EXISTS ${quote('crm_migration_fence_'+table+'_'+event.toLowerCase())} BEFORE ${event} ON ${quote(table)} WHEN (SELECT value FROM app_settings WHERE key='migration_read_only')='true'${exception} BEGIN SELECT RAISE(ABORT,'CRM migration: source is read-only'); END`;
 }));
}
