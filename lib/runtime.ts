import {DB} from './database';
export const env={DB,
 get CRM_CONNECTION_ENCRYPTION_KEY(){return process.env.CRM_CONNECTION_ENCRYPTION_KEY;},
 get CRM_GOOGLE_SERVICE_ACCOUNT_JSON(){return process.env.CRM_GOOGLE_SERVICE_ACCOUNT_JSON;}
};
