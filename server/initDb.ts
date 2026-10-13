import { getDb } from './db';
import { DB_FILE } from './config';

getDb();
console.log(`Banco pronto em ${DB_FILE}`);
