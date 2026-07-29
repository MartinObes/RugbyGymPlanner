<script setup lang="ts">
import { parseGrid } from '@coachlab/core/domain/parseGrid'
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

const tab = ref<'text' | 'excel'>('text')
const raw = ref('')
const parsed = ref<ParsedProgram | null>(null)
const fileName = ref<string | null>(null)
const importing = ref(false)
const confirmOpen = ref(false)

const EXAMPLE = `Semana 1
Día 1
# Fuerza
Press Banca 4x5 @80% RPE8
Sentadilla 4x5 @75% RPE8
# Core circuito x3
Plancha 3x30s
Rueda Abdominal 3x12`

function parsePastedText() {
  parsed.value = parseText(raw.value)
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileName.value = file.name

  // SheetJS corre en el BROWSER: el archivo no sube al servidor (CLAUDE.md §2).
  // El import dinámico lo mantiene fuera del bundle inicial.
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    toast.add({ title: 'La planilla no tiene hojas', color: 'error' })
    return
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, { header: 1 })
  parsed.value = parseGrid(rows)
}

const totals = computed(() => {
  if (!parsed.value) return null
  const days = parsed.value.weeks.reduce((sum, week) => sum + week.days.length, 0)
  const exercises = parsed.value.weeks.reduce(
    (sum, week) =>
      sum +
      week.days.reduce(
        (daySum, day) => daySum + day.blocks.reduce((blockSum, block) => blockSum + block.exercises.length, 0),
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
    await refresh()

    toast.add({
      title: `Importado: ${result.weeks} semanas, ${result.days} días, ${result.exercises} ejercicios`,
      description:
        result.createdExercises.length > 0
          ? `Se agregaron al catálogo: ${result.createdExercises.join(', ')}`
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
            :color="tab === 'text' ? 'primary' : 'neutral'"
            :variant="tab === 'text' ? 'soft' : 'ghost'"
            size="sm"
            @click="tab = 'text'"
          >
            Pegar texto
          </UButton>
          <UButton
            :color="tab === 'excel' ? 'primary' : 'neutral'"
            :variant="tab === 'excel' ? 'soft' : 'ghost'"
            size="sm"
            @click="tab = 'excel'"
          >
            Subir Excel
          </UButton>
        </div>
      </template>

      <div v-if="tab === 'text'" class="space-y-3">
        <UTextarea
          v-model="raw"
          :rows="12"
          class="w-full font-mono text-sm"
          placeholder="Pegá acá el programa…"
        />
        <div class="flex flex-wrap gap-2">
          <UButton :disabled="!raw.trim()" @click="parsePastedText">Ver previsualización</UButton>
          <UButton color="neutral" variant="ghost" @click="raw = EXAMPLE">Cargar ejemplo</UButton>
        </div>
        <details class="text-sm text-muted">
          <summary class="cursor-pointer">Formato esperado</summary>
          <pre class="mt-2 whitespace-pre-wrap rounded-md bg-elevated p-3 text-xs">{{ EXAMPLE }}</pre>
          <p class="mt-2">
            <code>Semana N</code> y <code>Día N</code> abren sección. Una línea que empieza con
            <code>#</code> abre un bloque; si termina en <code>x3</code> es un circuito de 3 vueltas.
            Cada ejercicio es <code>Nombre SxR [@carga] [RPEn]</code>, donde la carga puede ser
            <code>@80%</code> (del 1RM) o <code>@60kg</code>.
          </p>
        </details>
      </div>

      <div v-else class="space-y-3">
        <input
          type="file"
          accept=".xlsx,.xls"
          class="block w-full text-sm"
          @change="onFile"
        />
        <p v-if="fileName" class="text-sm text-muted">Archivo: {{ fileName }}</p>
        <p class="text-sm text-muted">
          La primera fila son los encabezados. Columnas reconocidas:
          <code>semana</code>, <code>dia</code>, <code>bloque</code>, <code>vueltas</code>,
          <code>ejercicio</code>, <code>series</code>, <code>reps</code>, <code>carga</code>,
          <code>rpe</code>. La carga acepta <code>80%</code>, <code>100kg</code> o vacío.
          El archivo se procesa en tu navegador: no se sube a ningún servidor.
        </p>
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
          No se pudo interpretar ninguna semana. Revisá el formato.
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
                    {{ exercise.exerciseName }} — {{ exercise.sets }}×{{ exercise.reps }}
                    <span v-if="exercise.loadType === 'PERCENTAGE'">· {{ exercise.percentage }}%</span>
                    <span v-else-if="exercise.loadType === 'WEIGHT'">· {{ exercise.weight }} kg</span>
                    <span v-if="exercise.targetRpe"> · RPE {{ exercise.targetRpe }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <UButton :disabled="!canImport" @click="confirmOpen = true">Reemplazar programa</UButton>
        </template>
      </UCard>

      <UCard v-if="parsed.issues.length > 0">
        <template #header>
          <h2 class="font-semibold text-warning">
            {{ parsed.issues.length }} {{ parsed.issues.length === 1 ? 'línea' : 'líneas' }} sin
            interpretar
          </h2>
        </template>
        <ul class="space-y-1 text-sm">
          <li v-for="(issue, index) in parsed.issues" :key="index">
            <span class="font-mono text-muted">Fila {{ issue.row }}:</span> {{ issue.message }}
          </li>
        </ul>
        <p class="mt-3 text-sm text-muted">
          El import se aplica igual, salteando estas líneas.
        </p>
      </UCard>
    </template>

    <UModal v-model:open="confirmOpen" title="¿Reemplazar el contenido del programa?">
      <template #body>
        <p class="text-sm text-muted">
          Se borran las semanas, días, bloques y ejercicios actuales, y se escriben los
          {{ totals?.weeks }} de la previsualización. No se puede deshacer.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="confirmOpen = false">Cancelar</UButton>
          <UButton color="warning" :loading="importing" @click="apply">Reemplazar</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
