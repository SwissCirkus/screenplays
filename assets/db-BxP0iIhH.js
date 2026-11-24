import{a as e}from"./core-CtwRC51V.js";import{t}from"./scriptFormat-CHtKXMn8.js";var n=class t{constructor(e){this.path=e}static async load(n){return new t(await e(`plugin:sql|load`,{db:n}))}static get(e){return new t(e)}async execute(t,n){let[r,i]=await e(`plugin:sql|execute`,{db:this.path,query:t,values:n??[]});return{lastInsertId:i,rowsAffected:r}}async select(t,n){return await e(`plugin:sql|select`,{db:this.path,query:t,values:n??[]})}async close(t){return await e(`plugin:sql|close`,{db:t})}},r=null;async function i(){return r||(r=await n.load(`sqlite:opendraft.db`),await a(r),await o(r),r)}async function a(e){try{await e.execute(`PRAGMA journal_mode = WAL`),await e.execute(`PRAGMA synchronous = NORMAL`),await e.execute(`PRAGMA busy_timeout = 5000`),await e.execute(`PRAGMA foreign_keys = ON`)}catch(e){console.warn(`[db] PRAGMA configuration failed:`,e)}}async function o(e){await e.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      properties    TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      color         TEXT NOT NULL DEFAULT '',
      pinned        INTEGER NOT NULL DEFAULT 0,
      sort_order    INTEGER NOT NULL DEFAULT 0
    );
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS scripts (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      page_count    INTEGER NOT NULL DEFAULT 0,
      size_bytes    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      color         TEXT NOT NULL DEFAULT '',
      pinned        INTEGER NOT NULL DEFAULT 0,
      sort_order    INTEGER NOT NULL DEFAULT 0
    );
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS idx_scripts_project ON scripts(project_id);
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS script_content (
      script_id     TEXT PRIMARY KEY REFERENCES scripts(id) ON DELETE CASCADE,
      content       TEXT
    );
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS version_commits (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      message       TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS idx_version_commits_project
      ON version_commits(project_id, created_at DESC);
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS version_scripts (
      id            TEXT PRIMARY KEY,
      commit_id     TEXT NOT NULL REFERENCES version_commits(id) ON DELETE CASCADE,
      script_id     TEXT NOT NULL,
      title         TEXT NOT NULL,
      content       TEXT,
      content_hash  TEXT NOT NULL DEFAULT '',
      inherited     INTEGER NOT NULL DEFAULT 0
    );
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS idx_version_scripts_commit
      ON version_scripts(commit_id);
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS idx_version_scripts_script
      ON version_scripts(script_id, commit_id);
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS assets (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type     TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes    INTEGER NOT NULL DEFAULT 0,
      tags          TEXT NOT NULL DEFAULT '[]',
      created_at    TEXT NOT NULL
    );
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS formatting_templates (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      mode          TEXT NOT NULL DEFAULT 'enforce',
      rules         TEXT NOT NULL,
      -- JSON array of element ids that must start on a new page (may be NULL)
      force_break_before TEXT DEFAULT NULL,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS script_files (
      script_id     TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL,
      path          TEXT NOT NULL,
      format        TEXT NOT NULL,
      -- SHA-256 of the file's text as last written or read; '' = unknown
      synced_hash   TEXT NOT NULL DEFAULT '',
      -- the file's modification time at that moment (ms since the epoch)
      synced_mtime  INTEGER NOT NULL DEFAULT 0,
      -- 1 = the library holds changes the file has not received yet
      pending       INTEGER NOT NULL DEFAULT 0,
      last_error    TEXT NOT NULL DEFAULT ''
    );
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS idx_script_files_project ON script_files(project_id);
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS project_folder_ignores (
      project_id    TEXT NOT NULL,
      name          TEXT NOT NULL,
      PRIMARY KEY (project_id, name)
    );
  `),await s(e)}async function s(e){let n=await e.select(`PRAGMA table_info(scripts)`);if(n.some(e=>e.name===`content`)&&await e.execute(`
      INSERT OR IGNORE INTO script_content (script_id, content)
      SELECT id, content FROM scripts WHERE content IS NOT NULL
    `),(await e.select(`SELECT name FROM sqlite_master WHERE type='table' AND name='versions'`)).length>0){let t=await e.select(`SELECT id, project_id, message, snapshot, created_at FROM versions ORDER BY created_at ASC`),n=new Map;for(let r of t){if((await e.select(`SELECT id FROM version_commits WHERE id = $1`,[r.id])).length>0)continue;await e.execute(`INSERT INTO version_commits (id, project_id, message, created_at) VALUES ($1, $2, $3, $4)`,[r.id,r.project_id,r.message,r.created_at]);let t=[];try{t=JSON.parse(r.snapshot||`[]`)}catch{}for(let i of t){let t=i.content?JSON.stringify(i.content):``,a=await c(t),o=(n.get(i.id)||``)===a?1:0,s=crypto.randomUUID?crypto.randomUUID():`${r.id}-${i.id}`;await e.execute(`INSERT INTO version_scripts (id, commit_id, script_id, title, content, content_hash, inherited)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,[s,r.id,i.id,i.title,o?null:t,a,o]),n.set(i.id,a)}}t.length,await e.execute(`DROP TABLE IF EXISTS versions`)}let r=await e.select(`PRAGMA table_info(projects)`),i=new Set(r.map(e=>e.name));i.has(`color`)||await e.execute(`ALTER TABLE projects ADD COLUMN color TEXT NOT NULL DEFAULT ''`),i.has(`pinned`)||await e.execute(`ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`),i.has(`sort_order`)||await e.execute(`ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);let a=new Set(n.map(e=>e.name));if(a.has(`color`)||await e.execute(`ALTER TABLE scripts ADD COLUMN color TEXT NOT NULL DEFAULT ''`),a.has(`pinned`)||await e.execute(`ALTER TABLE scripts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`),a.has(`sort_order`)||await e.execute(`ALTER TABLE scripts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`),a.has(`template_id`)||await e.execute(`ALTER TABLE scripts ADD COLUMN template_id TEXT DEFAULT NULL`),!a.has(`format`)){await e.execute(`ALTER TABLE scripts ADD COLUMN format TEXT NOT NULL DEFAULT 'screenplay'`);try{let n=await e.select(`SELECT script_id, content FROM script_content WHERE content LIKE '%"paragraph"%' OR content LIKE '%"heading"%'`);for(let r of n){let n=null;try{n=r.content?JSON.parse(r.content):null}catch{}t(n)&&await e.execute(`UPDATE scripts SET format = 'treatment' WHERE id = $1`,[r.script_id])}}catch(e){console.error(`[db] could not recognise existing treatments`,e)}}let o=await e.select(`PRAGMA table_info(formatting_templates)`);new Set(o.map(e=>e.name)).has(`force_break_before`)||await e.execute(`ALTER TABLE formatting_templates ADD COLUMN force_break_before TEXT DEFAULT NULL`)}async function c(e){if(!e)return``;if(typeof crypto<`u`&&crypto.subtle)try{let t=new TextEncoder().encode(e),n=await crypto.subtle.digest(`SHA-256`,t);return Array.from(new Uint8Array(n)).map(e=>e.toString(16).padStart(2,`0`)).join(``)}catch{}let t=5381;for(let n=0;n<e.length;n++)t=(t<<5)+t+e.charCodeAt(n)&4294967295;return t.toString(16)}export{i as getDb,c as simpleHash};