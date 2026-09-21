import Dexie, { type EntityTable } from 'dexie';
import { freshState, type StudyState } from './model';
import type { SyncRecord } from './sync';
type Database = Dexie & { state: EntityTable<{ id: string; value: StudyState }, 'id'>; sync: EntityTable<{id:string;record:SyncRecord},'id'> };
const databases = new Map<string, Database>();
function database(bankId: string) {
  if (!databases.has(bankId)) {
    // Preserve the existing local app's database for older, unlabelled banks.
    const db = new Dexie(bankId === 'local' ? 'saa-study-room' : `saa-study-room-${bankId}`) as Database;
    db.version(1).stores({ state: 'id' });
    db.version(2).stores({ state: 'id', sync: 'id' });
    databases.set(bankId, db);
  }
  return databases.get(bankId)!;
}
export async function loadState(bankId = 'local') { return (await database(bankId).state.get('main'))?.value ?? freshState(); }
export async function saveState(value: StudyState, bankId = 'local') { await database(bankId).state.put({ id: 'main', value }); }
export async function loadSyncRecord(bankId:string,userId:string){return (await database(bankId).sync.get(userId))?.record||null;}
export async function saveSyncRecord(bankId:string,userId:string,record:SyncRecord){await database(bankId).sync.put({id:userId,record});}
