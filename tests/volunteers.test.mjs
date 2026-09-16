import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyPersonIdentityToUser, applyPersonIdentityToVolunteer } from '../src/lib/personIdentity.js';
import { attendanceIncidentRequiresReview } from '../src/services/volunteers/attendanceIncidentUtils.js';
import {
  enrichVolunteers,
  filterAndSortVolunteers,
  nextAvailableVolunteerCode,
  volunteerPayloadFromForm
} from '../src/services/volunteers/volunteerListUtils.js';
import { VoluntarioService } from '../src/services/volunteers/VoluntarioService.js';

const AGUSTINE_PRIMARY_ID = '062a0fc5-5f33-4038-bcd7-5faabafae42f';
const AGUSTINE_SECONDARY_ID = '4f1b98f1-b0cd-4149-b057-262e6e12f8d5';

function volunteer(overrides = {}) {
  return {
    id: randomUUID(),
    code: 'VOL-2026-9999',
    full_name: 'Voluntario Test',
    document_id: '',
    phone: '',
    email: '',
    status: 'Activo',
    joined_at: '2026-09-01',
    notes: '',
    ...overrides
  };
}

function productionLikeVolunteers() {
  const rows = Array.from({ length: 17 }, (_, index) => volunteer({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    code: `VOL-2026-${String(index + 1).padStart(4, '0')}`,
    full_name: `Voluntario ${String(index + 1).padStart(2, '0')}`
  }));

  rows[9] = volunteer({
    id: '7d375f57-1111-4111-8111-000000000010',
    code: 'VOL-2026-0010',
    full_name: 'DORKA CORPORAN MEDINA'
  });
  rows[10] = volunteer({
    id: '23e32ea0-2222-4222-8222-000000000010',
    code: 'VOL-2026-0010',
    full_name: 'ESTHER CORPORAN MEDINA'
  });

  return [
    ...rows,
    volunteer({
      id: AGUSTINE_PRIMARY_ID,
      code: 'VOL-2026-0018',
      full_name: 'AGUSTINE',
      person_identity_id: '43d6b809-0000-4000-8000-000000000001'
    }),
    volunteer({
      id: AGUSTINE_SECONDARY_ID,
      code: 'VOL-2026-0003',
      full_name: 'AGUSTINE',
      person_identity_id: '89eace74-0000-4000-8000-000000000002'
    })
  ];
}

test('el pipeline visual conserva los 19 voluntarios y las dos fichas AGUSTINE', () => {
  const enriched = enrichVolunteers(productionLikeVolunteers());
  const visible = filterAndSortVolunteers(enriched, '', 'code');
  const agustines = filterAndSortVolunteers(enriched, 'AGUSTINE', 'code');
  const renderedCardIds = visible.map((item) => item.id);

  assert.equal(enriched.length, 19);
  assert.equal(visible.length, 19);
  assert.deepEqual(
    agustines.map((item) => item.id).sort(),
    [AGUSTINE_PRIMARY_ID, AGUSTINE_SECONDARY_ID].sort()
  );
  assert.ok(renderedCardIds.includes(AGUSTINE_PRIMARY_ID));
  assert.ok(renderedCardIds.includes(AGUSTINE_SECONDARY_ID));
});

test('los codigos duplicados no colapsan filas distintas', () => {
  const enriched = enrichVolunteers(productionLikeVolunteers());
  const duplicatedCodeRows = filterAndSortVolunteers(enriched, 'VOL-2026-0010', 'code');

  assert.equal(duplicatedCodeRows.length, 2);
  assert.deepEqual(
    duplicatedCodeRows.map((item) => item.full_name).sort(),
    ['DORKA CORPORAN MEDINA', 'ESTHER CORPORAN MEDINA'].sort()
  );
});

test('la sugerencia de codigo salta codigos usados o repetidos', () => {
  const code = nextAvailableVolunteerCode(productionLikeVolunteers(), 'VOL-2026-0001');
  assert.equal(code, 'VOL-2026-0019');
});

test('el payload de alta no fuerza created_at y la edicion no crea identidad nueva', () => {
  const form = {
    full_name: 'Alta Test',
    code: 'VOL-2026-0001',
    document_id: 'X123',
    phone: '600000000',
    email: 'alta@example.test',
    joined_at: '2026-09-11',
    notes: ''
  };
  const createPayload = volunteerPayloadFromForm(form, productionLikeVolunteers(), null);
  assert.equal(Object.hasOwn(createPayload, 'created_at'), false);

  const current = volunteer({
    id: 'current-volunteer',
    code: 'VOL-2026-0020',
    created_at: '2026-09-10T10:00:00.000Z',
    person_identity_id: 'existing-identity'
  });
  const editPayload = volunteerPayloadFromForm({ ...form, code: current.code }, productionLikeVolunteers(), current);
  assert.equal(editPayload.created_at, current.created_at);
  assert.equal(editPayload.person_identity_id, current.person_identity_id);
});

test('crear segunda asistencia abierta devuelve error comprensible antes del SQL', async () => {
  const service = new VoluntarioService({
    repository: {
      createTimeEntry: async () => {
        throw new Error('No deberia insertar');
      }
    },
    volunteers: [volunteer({ id: 'volunteer-open-entry' })],
    timeEntries: [{ id: 'entry-open', volunteer_id: 'volunteer-open-entry', status: 'open', check_out_at: null }]
  });

  await assert.rejects(
    () => service.createTimeEntry({ volunteer_id: 'volunteer-open-entry', status: 'open' }),
    /entrada abierta/i
  );
});

test('una carrera contra el indice de asistencia abierta no muestra el error SQL crudo', async () => {
  const duplicateError = new Error('duplicate key value violates unique constraint "volunteer_time_entries_one_open_per_volunteer_idx"');
  duplicateError.code = '23505';
  const service = new VoluntarioService({
    repository: {
      createTimeEntry: async () => {
        throw duplicateError;
      }
    },
    volunteers: [volunteer({ id: 'volunteer-race-entry' })],
    timeEntries: []
  });

  await assert.rejects(
    () => service.createTimeEntry({ volunteer_id: 'volunteer-race-entry', status: 'open' }),
    (error) => /entrada abierta/i.test(error.message) && !/duplicate key/i.test(error.message)
  );
});

test('un alta con duplicado de voluntario devuelve mensaje funcional', async () => {
  const duplicateError = new Error('duplicate key value violates unique constraint "volunteers_code_unique_idx"');
  duplicateError.code = '23505';
  const service = new VoluntarioService({
    repository: {
      createVolunteer: async () => {
        throw duplicateError;
      }
    }
  });

  await assert.rejects(
    () => service.create({
      code: 'VOL-2026-0019',
      full_name: 'Duplicado Test',
      status: 'Activo',
      joined_at: '2026-09-11'
    }),
    /Ya existe una ficha de voluntario/i
  );
});

test('la identidad compartida no suplanta los datos ni permisos del usuario ERP', () => {
  const user = {
    id: 'admin-user',
    first_name: 'Eliza',
    last_name: 'Admin',
    email: 'admin@example.test',
    phone: '600111222',
    role: 'Superadministrador',
    permissions: ['*'],
    permission_matrix: { volunteers: { view: true, edit: true } },
    profile_photo: 'data:image/png;base64,APPUSER',
    person_identity_id: 'shared-identity'
  };
  const identity = {
    id: 'shared-identity',
    full_name: 'UBER',
    email: 'uber@example.test',
    phone: '600999888',
    photo_data_url: 'data:image/png;base64,VOLUNTEER'
  };

  const enriched = applyPersonIdentityToUser(user, identity);

  assert.equal(enriched.first_name, 'Eliza');
  assert.equal(enriched.last_name, 'Admin');
  assert.equal(enriched.email, 'admin@example.test');
  assert.equal(enriched.phone, '600111222');
  assert.equal(enriched.role, 'Superadministrador');
  assert.deepEqual(enriched.permissions, ['*']);
  assert.equal(enriched.profile_photo, 'data:image/png;base64,APPUSER');
  assert.equal(enriched.identity_full_name, 'UBER');
});

test('la identidad enlazada solo completa campos ausentes del expediente de voluntario', () => {
  const volunteerRecord = volunteer({
    full_name: 'Voluntaria Guardada',
    email: 'voluntaria@example.test',
    photo_data_url: 'data:image/png;base64,VOLUNTEER'
  });
  const identity = {
    full_name: 'Nombre Antiguo',
    email: 'antiguo@example.test',
    phone: '600000000',
    photo_data_url: 'data:image/png;base64,OLD'
  };

  const enriched = applyPersonIdentityToVolunteer(volunteerRecord, identity);

  assert.equal(enriched.full_name, volunteerRecord.full_name);
  assert.equal(enriched.email, volunteerRecord.email);
  assert.equal(enriched.photo_data_url, volunteerRecord.photo_data_url);
  assert.equal(enriched.phone, identity.phone);
});

test('el service worker no vuelve a cachear respuestas autenticadas del ERP', () => {
  const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

  assert.match(serviceWorker, /request\.headers\.has\("authorization"\)/);
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /STATIC_ASSETS\.includes\(url\.pathname\)/);
  assert.doesNotMatch(serviceWorker, /return cached \|\| networkFetch/);
});

test('la migracion de alta de voluntario reutiliza person_identity_id existente', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260915102000_fix_volunteer_identity_participation.sql', import.meta.url),
    'utf8'
  );

  assert.match(migration, /v_payload_identity_id uuid := nullif\(p_payload->>'person_identity_id'/);
  assert.match(migration, /where identity_row\.id = v_payload_identity_id/);
  assert.match(migration, /where existing_volunteer\.person_identity_id = v_identity_id/);
  assert.match(migration, /values \([\s\S]*v_identity_id[\s\S]*\)/);
});

test('la edicion de voluntarios se realiza de forma atomica y conserva la foto si no se envia otra', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260916113000_make_volunteer_updates_atomic.sql', import.meta.url),
    'utf8'
  );

  assert.match(migration, /create or replace function public\.update_volunteer_with_identity/);
  assert.match(migration, /security definer/);
  assert.match(migration, /for update/);
  assert.match(migration, /photo_data_url = coalesce\(nullif\(v_photo_data_url, ''\), photo_data_url\)/);
  assert.match(migration, /grant execute on function public\.update_volunteer_with_identity\(uuid, jsonb\) to authenticated/);
});

test('solo las incidencias pendientes entran en el contador de revisión', () => {
  const pending = { id: 'pending-incident', status: 'incident', incident_type: 'Fichaje excesivamente largo', incident_review_status: 'pending' };
  const reviewed = { ...pending, id: 'reviewed-incident', incident_review_status: 'reviewed' };
  const corrected = { ...pending, id: 'corrected-incident', status: 'corrected', incident_review_status: 'resolved' };

  assert.equal(attendanceIncidentRequiresReview(pending), true);
  assert.equal(attendanceIncidentRequiresReview(reviewed), false);
  assert.equal(attendanceIncidentRequiresReview(corrected), false);
});

test('la migración de incidencias conserva el historial y normaliza solo incidencias históricas cerradas', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260916133000_track_volunteer_attendance_incident_reviews.sql', import.meta.url),
    'utf8'
  );

  assert.match(migration, /add column if not exists incident_review_status/);
  assert.match(migration, /incident_review_status = 'reviewed'/);
  assert.match(migration, /status = 'incident'/);
  assert.match(migration, /check_out_at is not null/);
});

test('el diagnostico temporal de render no queda en Volunteers.jsx', () => {
  const source = readFileSync(new URL('../src/pages/Volunteers.jsx', import.meta.url), 'utf8');

  assert.equal(source.includes('Diagnóstico temporal Voluntarios'), false);
  assert.equal(source.includes('VOLUNTEER_RENDER_DIAGNOSTIC_IDS'), false);
  assert.equal(source.includes('data-volunteer-render-diagnostic'), false);
});
