import Database from 'better-sqlite3'
import path from 'node:path'
import { app } from 'electron'

let db: Database.Database

export function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'nova.db')
  db = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT,
      github_repo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id);
    CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at DESC);

    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      avatar_path TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO user_profile (id) VALUES (1);
  `)

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

// ── Projects ─────────────────────────────────────────────────────────

export function getAllProjects() {
  return getDb().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
}

export function addProject(project: { id: string; name: string; path?: string; githubRepo?: string }) {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO projects (id, name, path, github_repo)
    VALUES (@id, @name, @path, @githubRepo)
  `)
  stmt.run({ id: project.id, name: project.name, path: project.path || null, githubRepo: project.githubRepo || null })
  return getAllProjects()
}

export function removeProject(id: string) {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  return getAllProjects()
}

// ── Threads ──────────────────────────────────────────────────────────

export function getAllThreads() {
  return getDb().prepare('SELECT * FROM threads ORDER BY updated_at DESC').all()
}

export function getThread(id: string) {
  return getDb().prepare('SELECT * FROM threads WHERE id = ?').get(id)
}

export function createThread(thread: { id: string; title: string; projectId?: string }) {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO threads (id, title, project_id)
    VALUES (@id, @title, @projectId)
  `)
  stmt.run({ id: thread.id, title: thread.title, projectId: thread.projectId || null })
  return getThread(thread.id)
}

export function updateThread(id: string, updates: { title?: string; projectId?: string | null }) {
  const fields: string[] = []
  const params: Record<string, any> = { id }

  if (updates.title !== undefined) {
    fields.push('title = @title')
    params.title = updates.title
  }
  if (updates.projectId !== undefined) {
    fields.push('project_id = @projectId')
    params.projectId = updates.projectId
  }

  if (fields.length === 0) return getThread(id)

  fields.push("updated_at = datetime('now')")
  getDb().prepare(`UPDATE threads SET ${fields.join(', ')} WHERE id = @id`).run(params)
  return getThread(id)
}

export function deleteThread(id: string) {
  getDb().prepare('DELETE FROM threads WHERE id = ?').run(id)
  return getAllThreads()
}

// ── Messages ─────────────────────────────────────────────────────────

export function getMessages(threadId: string) {
  return getDb().prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC').all(threadId)
}

export function addMessage(message: { id: string; threadId: string; role: string; content: string }) {
  const stmt = getDb().prepare(`
    INSERT INTO messages (id, thread_id, role, content)
    VALUES (@id, @threadId, @role, @content)
  `)
  stmt.run(message)

  // Touch the thread's updated_at
  getDb().prepare("UPDATE threads SET updated_at = datetime('now') WHERE id = ?").run(message.threadId)

  return getDb().prepare('SELECT * FROM messages WHERE id = ?').get(message.id)
}

export function deleteMessage(id: string) {
  getDb().prepare('DELETE FROM messages WHERE id = ?').run(id)
}

// ── User Profile ────────────────────────────────────────────────────

export function getUserProfile() {
  return getDb().prepare('SELECT * FROM user_profile WHERE id = 1').get()
}

export function updateUserProfile(updates: { firstName?: string; lastName?: string; email?: string; avatarPath?: string | null }) {
  const fields: string[] = []
  const params: Record<string, any> = { id: 1 }

  if (updates.firstName !== undefined) {
    fields.push('first_name = @firstName')
    params.firstName = updates.firstName
  }
  if (updates.lastName !== undefined) {
    fields.push('last_name = @lastName')
    params.lastName = updates.lastName
  }
  if (updates.email !== undefined) {
    fields.push('email = @email')
    params.email = updates.email
  }
  if (updates.avatarPath !== undefined) {
    fields.push('avatar_path = @avatarPath')
    params.avatarPath = updates.avatarPath
  }

  if (fields.length === 0) return getUserProfile()

  fields.push("updated_at = datetime('now')")
  getDb().prepare(`UPDATE user_profile SET ${fields.join(', ')} WHERE id = @id`).run(params)
  return getUserProfile()
}

export function closeDatabase() {
  if (db) db.close()
}
