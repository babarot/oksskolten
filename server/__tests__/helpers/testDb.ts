import { _resetDb, runMigrations } from '../../db.js'

export function setupTestDb() {
  _resetDb(':memory:')
  runMigrations()
}
