<script setup lang="ts">
import { isRoutineSheet, parseCoachSheet } from '@coachlab/core/domain/parseCoachSheet'
import { parseText } from '@coachlab/core/domain/parseText'
import type { ParsedProgram } from '@coachlab/core/validators/parsedProgram'
import type { ProgramTreeResponse } from '~~/generated'

type ProgramContext = {
  program: Ref<ProgramTreeResponse['program'] | null>
  refresh: () => Promise<void>
  programId: string
}

const { refresh, programId } = inject<ProgramContext>('program')!
const api = useCoachApi()
const toast = useToast()

const tab = ref<'excel' | 'text'>('excel')
const raw = ref('')
const parsed = ref<ParsedProgram | null>(null)
const importing = ref(false)
const confirmOpen = ref(false)

// --- Excel -------------------------------------------------------------------

type SheetOption = { name: string; isRoutine: boolean; rows: unknown[][] }

const fileName = ref<string | null>(null)
const sheets = ref<SheetOption[]>([])
const selectedSheet = ref<string | undefined>(undefined)
const reading = ref(false)

const routineSheets = computed(() => sheets.value.filter((s) => s.isRoutine))
const skippedSheets = computed(() => sheets.value.filter((s) => !s.isRoutine))

const sheetItems = computed(() =>
  routineSheets.value.map((s) => ({ label: s.name, value: s.name })),
)

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  reading.value = true
  parsed.value = null
  selectedSheet.value = undefined
  fileName.value = file.name

  try {
    // SheetJS corre en el BROWSER: el archivo no sube al servidor (CLAUDE.md §2).
    // El import dinámico lo mantiene fuera del bundle inicial.
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })

    sheets.value = workbook.SheetNames.map((name) => {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name]!, {
        header: 1,
        blankrows: false,
        defval: null,
      })
      return { name, rows, isRoutine: isRoutineSheet(rows) }
    })

    if (routineSheets.value.length === 0) {
      toast.add({
        title: 'No se encontró ninguna hoja de rutina',
        description: 'Las hojas de rutina tienen una fila con los encabezados "kilos" y "repet".',
        color: 'warning',
      })
      return
    }

    // La última hoja de rutina suele ser la más reciente del mesociclo.
    selectedSheet.value = routineSheets.value[routineSheets.value.length - 1]!.name
    parseSelectedSheet()
  } catch (e) {
    toast.add({
      title: 'No se pudo leer el archivo',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  } finally {
    reading.value = false
  }
}

function parseSelectedSheet() {
  const sheet = sheets.value.find((s) => s.name === selectedSheet.value)
  parsed.value = sheet ? parseCoachSheet(sheet.rows, sheet.name) : null
}

watch(selectedSheet, () => {
  if (selectedSheet.value) parseSelectedSheet()
})

// --- texto -------------------------------------------------------------------

const EXAMPLE = `Semana 1
Día 1
# Fuerza
Press Banca 4x5 @80% RPE8
Sentadilla 4x5 @75% RPE8
# Core circuito x3
Plancha 3x30s`

function parsePastedText() {
  parsed.value = parseText(raw.value)
}

// --- aplicar -----------------------------------------------------------------

const totals = computed(() => {
  if (!parsed.value) return null
  const days = parsed.value.weeks.reduce((sum, week) => sum + week.days.length, 0)
  const exercises = parsed.value.weeks.reduce(
    (sum, week) =>
      sum +
      week.days.reduce(
        (daySum, day) =>
          daySum + day.blocks.reduce((blockSum, block) => blockSum + block.exercises.length, 0),
        0,
      ),
    0,
  )
  return { weeks: parsed.value.weeks.length, days, exercises }
})

const canImport = computed(() => (parsed.value?.weeks.length ?? 0) > 0)

async function apply() {
  if (!parsed.value || !canImport.value) return
  importing.value = true
  try {
    const result = await api.post<{
      ok: true
      weeks: number
      days: number
      exercises: number
      createdExercises: string[]
    }>(`/api/coach/programs/${programId}/import`, parsed.value)

    confirmOpen.value = false
    parsed.value = null
    raw.value = ''
    fileName.value = null
    sheets.value = []
    await refresh()

    toast.add({
      title: `Importado: ${result.weeks} semanas, ${result.days} días, ${result.exercises} ejercicios`,
      description:
        result.createdExercises.length > 0
          ? `Se agregaron al catálogo: ${result.createdExercises.slice(0, 6).join(', ')}${
              result.createdExercises.length > 6 ? ` y ${result.createdExercises.length - 6} más` : ''
            }`
          : undefined,
      color: 'success',
    })
    await navigateTo(`/coach/programs/${programId}`)
  } catch (e) {
    toast.add({
      title: 'No se pudo importar',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  } finally {
    importing.value = false
  }
}

const loadOf = (exercise: {
  loadType: string
  weight: number | null
  percentage: number | null
  loadLabel: string | null
}) => {
  if (exercise.loadType === 'WEIGHT') return `${exercise.weight} kg`
  if (exercise.loadType === 'PERCENTAGE') return `${exercise.percentage}%`
  if (exercise.loadType === 'LABEL') return exercise.loadLabel
  return null
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="El import reemplaza el contenido"
      description="Se borran las semanas, días y ejercicios que el programa tenga ahora. Las asignaciones a jugadores se mantienen."
    />

    <UCard>
      <template #header>
        <div class="flex gap-1">
          <UButton
            :color="tab === 'excel' ? 'primary' : 'neutral'"
            :variant="tab === 'excel' ? 'soft' : 'ghost'"
            size="sm"
            @click="() => { tab = 'excel' }"
          >
            Subir planilla
          </UButton>
          <UButton
            :color="tab === 'text' ? 'primary' : 'neutral'"
            :variant="tab === 'text' ? 'soft' : 'ghost'"
            size="sm"
            @click="() => { tab = 'text' }"
          >
            Pegar texto
          </UButton>
        </div>
      </template>

      <div v-if="tab === 'excel'" class="space-y-4">
        <input type="file" accept=".xlsx,.xls" class="block w-full text-sm" @change="onFile">

        <p v-if="reading" class="text-sm text-muted">Leyendo la planilla…</p>

        <template v-if="sheets.length > 0">
          <div class="flex flex-wrap items-end gap-3">
            <UFormField label="Hoja a importar" class="min-w-56 flex-1">
              <USelect v-model="selectedSheet" :items="sheetItems" class="w-full" />
            </UFormField>
            <p class="text-sm text-muted">
              {{ routineSheets.length }} de {{ sheets.length }} hojas son rutinas
            </p>
          </div>

          <details v-if="skippedSheets.length > 0" class="text-sm text-muted">
            <summary class="cursor-pointer">
              {{ skippedSheets.length }} hojas salteadas (no son rutinas)
            </summary>
            <p class="mt-2">{{ skippedSheets.map((s) => s.name).join(' · ') }}</p>
            <p class="mt-1">
              Una hoja es de rutina si tiene la fila con los encabezados
              <code>kilos</code> y <code>repet</code>. El calendario de micros, el plantel y las
              hojas de aeróbico no la tienen.
            </p>
          </details>
        </template>

        <details class="text-sm text-muted">
          <summary class="cursor-pointer">Qué espera de la planilla</summary>
          <ul class="mt-2 ml-4 list-disc space-y-1">
            <li>Columna A: el marcador <code>bloque n</code>.</li>
            <li>Columna B: el nombre del bloque y, debajo, los ejercicios.</li>
            <li>
              <code>SESION n - DÍA</code> abre un día; una fila con
              <code>N VUELTAS</code> en la carga abre un circuito.
            </li>
            <li>
              Una fila de encabezados con <code>kilos</code> y <code>repet</code> por cada semana.
              Cada semana de la planilla se convierte en una semana del programa, con sus propias
              cargas.
            </li>
            <li>
              La carga puede ser un número (kg) o una etiqueta (<code>p.corp</code>,
              <code>barra</code>, <code>goma</code>, <code>med 9</code>).
            </li>
          </ul>
          <p class="mt-2">El archivo se procesa en tu navegador: no se sube a ningún servidor.</p>
        </details>
      </div>

      <div v-else class="space-y-3">
        <UTextarea
          v-model="raw"
          :rows="12"
          class="w-full font-mono text-sm"
          placeholder="Pegá acá el programa…"
        />
        <div class="flex flex-wrap gap-2">
          <UButton :disabled="!raw.trim()" @click="parsePastedText">Ver previsualización</UButton>
          <UButton color="neutral" variant="ghost" @click="() => { raw = EXAMPLE }">Cargar ejemplo</UButton>
        </div>
        <details class="text-sm text-muted">
          <summary class="cursor-pointer">Formato esperado</summary>
          <pre class="mt-2 whitespace-pre-wrap rounded-md bg-elevated p-3 text-xs">{{ EXAMPLE }}</pre>
        </details>
      </div>
    </UCard>

    <!-- Previsualización -->
    <template v-if="parsed">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-semibold">Previsualización</h2>
            <span v-if="totals" class="text-sm text-muted">
              {{ totals.weeks }} semanas · {{ totals.days }} días · {{ totals.exercises }} ejercicios
            </span>
          </div>
        </template>

        <p v-if="parsed.weeks.length === 0" class="text-muted">
          No se pudo interpretar ninguna semana en esta hoja.
        </p>

        <div v-else class="space-y-4">
          <div v-for="(week, weekIndex) in parsed.weeks" :key="weekIndex">
            <p class="font-medium">{{ week.name }}</p>
            <div v-for="(day, dayIndex) in week.days" :key="dayIndex" class="ml-4 mt-2">
              <p class="text-sm font-medium text-muted">{{ day.name }}</p>
              <div v-for="(block, blockIndex) in day.blocks" :key="blockIndex" class="ml-4 mt-1">
                <p class="text-xs text-muted">
                  {{ block.type === 'CIRCUIT' ? `Circuito × ${block.rounds}` : 'Bloque' }}
                </p>
                <ul class="ml-2 text-sm">
                  <li v-for="(exercise, exerciseIndex) in block.exercises" :key="exerciseIndex">
                    {{ exercise.exerciseName }} — {{ exercise.reps }}
                    <span v-if="loadOf(exercise)" class="text-muted">· {{ loadOf(exercise) }}</span>
                    <span v-if="exercise.targetRpe" class="text-muted">
                      · RPE {{ exercise.targetRpe }}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <UButton :disabled="!canImport" @click="() => { confirmOpen = true }">Reemplazar programa</UButton>
        </template>
      </UCard>

      <UCard v-if="parsed.issues.length > 0">
        <template #header>
          <h2 class="font-semibold text-warning">
            {{ parsed.issues.length }}
            {{ parsed.issues.length === 1 ? 'aviso' : 'avisos' }}
          </h2>
        </template>
        <ul class="space-y-1 text-sm">
          <li v-for="(issue, index) in parsed.issues" :key="index">
            <span class="font-mono text-muted">Fila {{ issue.row }}:</span> {{ issue.message }}
          </li>
        </ul>
        <p class="mt-3 text-sm text-muted">El import se aplica igual, salteando estas líneas.</p>
      </UCard>
    </template>

    <UModal v-model:open="confirmOpen" title="¿Reemplazar el contenido del programa?">
      <template #body>
        <p class="text-sm text-muted">
          Se borran las semanas, días, bloques y ejercicios actuales, y se escriben las
          {{ totals?.weeks }} de la previsualización. No se puede deshacer.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="() => { confirmOpen = false }">Cancelar</UButton>
          <UButton color="warning" :loading="importing" @click="apply">Reemplazar</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
