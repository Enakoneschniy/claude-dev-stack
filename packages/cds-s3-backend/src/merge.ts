import Database from 'better-sqlite3';
import { S3SchemaVersionError } from './errors.js';

export interface MergeResult {
  sessionsAdded: number;
  observationsAdded: number;
  entitiesAdded: number;
  relationsAdded: number;
}

/**
 * Merge remote sessions into the local database using session-scoped row import.
 *
 * Per ADR-004: sessions not in the local DB (by UUID) are imported along with
 * their observations (with new auto-generated IDs), entities (INSERT OR IGNORE
 * by unique name), and relations (INSERT OR IGNORE on composite PK). Entity
 * references in observations.entities JSON are remapped to local IDs.
 */
export function mergeRemoteIntoLocal(localDbPath: string, remoteDbPath: string): MergeResult {
  const db = new Database(localDbPath);
  const result: MergeResult = { sessionsAdded: 0, observationsAdded: 0, entitiesAdded: 0, relationsAdded: 0 };

  try {
    // Schema version check (D-03)
    const localVersion = db.pragma('user_version', { simple: true }) as number;
    const remoteDb = new Database(remoteDbPath, { readonly: true });
    const remoteVersion = remoteDb.pragma('user_version', { simple: true }) as number;
    remoteDb.close();

    if (remoteVersion > localVersion) {
      throw new S3SchemaVersionError(localVersion, remoteVersion);
    }

    // ATTACH remote
    db.prepare('ATTACH DATABASE ? AS remote').run(remoteDbPath);

    // Wrap in transaction for atomicity
    const merge = db.transaction(() => {
      // 1. Find sessions in remote that don't exist locally
      const remoteSessions = db.prepare(
        'SELECT r.id, r.start_time, r.end_time, r.project, r.summary ' +
        'FROM remote.sessions r WHERE r.id NOT IN (SELECT id FROM main.sessions)'
      ).all() as Array<{id: string; start_time: string; end_time: string | null; project: string; summary: string | null}>;

      if (remoteSessions.length === 0) {
        return; // Nothing to merge
      }

      // Prepare insert statements
      const insertSession = db.prepare(
        'INSERT INTO sessions (id, start_time, end_time, project, summary) VALUES (?, ?, ?, ?, ?)'
      );
      const insertObservation = db.prepare(
        'INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)'
      );
      // Entity upsert: INSERT OR IGNORE preserves existing entities by unique name
      const upsertEntity = db.prepare(
        'INSERT OR IGNORE INTO entities (name, display_name, type, first_seen, last_updated) ' +
        'VALUES (?, ?, ?, ?, ?)'
      );
      const getEntityId = db.prepare('SELECT id FROM entities WHERE name = ?');
      const insertRelation = db.prepare(
        'INSERT OR IGNORE INTO relations (from_entity, to_entity, relation_type, observed_in_session) VALUES (?, ?, ?, ?)'
      );

      for (const session of remoteSessions) {
        // Insert session
        insertSession.run(session.id, session.start_time, session.end_time, session.project, session.summary);
        result.sessionsAdded++;

        // 2. Import entities from remote that are referenced by this session's observations/relations
        // Build entity ID mapping: remote entity ID -> local entity ID
        const entityIdMap = new Map<number, number>();

        const remoteEntitiesForSession = db.prepare(
          'SELECT DISTINCT e.id, e.name, e.display_name, e.type, e.first_seen, e.last_updated ' +
          'FROM remote.entities e ' +
          'WHERE e.id IN (' +
          '  SELECT r.from_entity FROM remote.relations r WHERE r.observed_in_session = ?' +
          '  UNION' +
          '  SELECT r.to_entity FROM remote.relations r WHERE r.observed_in_session = ?' +
          ')'
        ).all(session.id, session.id) as Array<{id: number; name: string; display_name: string | null; type: string; first_seen: string; last_updated: string}>;

        for (const entity of remoteEntitiesForSession) {
          upsertEntity.run(entity.name, entity.display_name, entity.type, entity.first_seen, entity.last_updated);
          const localEntity = getEntityId.get(entity.name) as {id: number};
          entityIdMap.set(entity.id, localEntity.id);
        }
        result.entitiesAdded += remoteEntitiesForSession.length;

        // 3. Import observations from this session
        // Omit 'id' column — let AUTOINCREMENT assign new local IDs
        // Remap entity references in the 'entities' JSON column
        const remoteObs = db.prepare(
          'SELECT session_id, type, content, entities, created_at ' +
          'FROM remote.observations WHERE session_id = ? ORDER BY id'
        ).all(session.id) as Array<{session_id: string; type: string; content: string; entities: string; created_at: string}>;

        for (const obs of remoteObs) {
          // Remap entity IDs in the JSON array
          let remappedEntities = obs.entities;
          try {
            const entityIds = JSON.parse(obs.entities) as number[];
            const remappedIds = entityIds.map(rid => entityIdMap.get(rid) ?? rid);
            remappedEntities = JSON.stringify(remappedIds);
          } catch {
            // If entities JSON is malformed, keep as-is
          }

          insertObservation.run(obs.session_id, obs.type, obs.content, remappedEntities, obs.created_at);
          result.observationsAdded++;
        }

        // 4. Import relations for this session
        const remoteRelations = db.prepare(
          'SELECT from_entity, to_entity, relation_type, observed_in_session ' +
          'FROM remote.relations WHERE observed_in_session = ?'
        ).all(session.id) as Array<{from_entity: number; to_entity: number; relation_type: string; observed_in_session: string}>;

        for (const rel of remoteRelations) {
          const localFrom = entityIdMap.get(rel.from_entity);
          const localTo = entityIdMap.get(rel.to_entity);
          if (localFrom !== undefined && localTo !== undefined) {
            insertRelation.run(localFrom, localTo, rel.relation_type, rel.observed_in_session);
            result.relationsAdded++;
          }
        }
      }
    });

    merge();

    db.prepare('DETACH DATABASE remote').run();
  } finally {
    db.close();
  }

  return result;
}
