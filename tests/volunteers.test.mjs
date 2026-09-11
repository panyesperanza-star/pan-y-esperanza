import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
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
