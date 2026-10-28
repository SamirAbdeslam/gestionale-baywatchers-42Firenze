import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { readEnv } from '../env.ts';
import * as schema from './schema.ts';

export const client = postgres(readEnv().DATABASE_URL, { connect_timeout: 5 });
export const db = drizzle(client, { schema });

export type Database = Pick<typeof db, 'insert' | 'select' | 'update' | 'delete'>;
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
