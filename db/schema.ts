import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('rooms',{code:text('code').primaryKey(),state:text('state').notNull(),members:text('members').notNull(),revision:integer('revision').notNull().default(0),expires:integer('expires').notNull()});
