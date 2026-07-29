<script setup lang="ts">
import { POSITIONS, isPositionId, type PositionId } from '@coachlab/core/domain/positions'
import { changePasswordSchema } from '@coachlab/core/validators/auth'
import { playerProfileSchema } from '@coachlab/core/validators/player'
import type { ExercisesResponse, PlayerProfileResponse } from '~~/generated'

const api = usePlayerApi()
const toast = useToast()
const { user, refresh: refreshSession, changePassword } = useAuth()

const { data, refresh } = await useAsyncData('player-profile', () =>
  api.get<PlayerProfileResponse>('/api/player/profile'),
)

// ExerciseTypeahead no trae el catálogo: recibe la lista y emite el id.
const { data: catalog } = await useAsyncData('catalog-exercises', () =>
  api.get<ExercisesResponse>('/api/catalog/exercises'),
)
const exercises = computed(() => catalog.value?.exercises ?? [])

const positionItems = POSITIONS.map((p) => ({ label: p.name, value: p.id }))

// El puesto guardado viene como `string | null` del contrato de la API, pero
// USelect deriva su tipo de :items, así que solo acepta un PositionId (o
// undefined). Se estrecha acá con el guard del dominio en vez de castear: si la
// base tuviera un slug que el código no conoce, queda sin seleccionar en lugar
// de romper el select.
const storedPosition = data.value?.profile.positionId

const profileForm = reactive<{
  name: string
  positionId: PositionId | undefined
  heightCm: number | null
  weightKg: number | null
}>({
  name: data.value?.profile.name ?? '',
  positionId: storedPosition && isPositionId(storedPosition) ? storedPosition : undefined,
  heightCm: data.value?.profile.heightCm ?? null,
  weightKg: data.value?.profile.weightKg ?? null,
})

async function saveProfile() {
  try {
    // positionId viaja como null cuando no hay ninguno elegido: el schema es
    // nullish y la ruta escribe null, no deja el campo sin tocar.
    await api.patch('/api/player/profile', {
      ...profileForm,
      positionId: profileForm.positionId ?? null,
    })
    await Promise.all([refresh(), refreshSession()])
    toast.add({ title: 'Perfil guardado' })
  } catch (error) {
    toast.add({
      title: 'No se pudo guardar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  }
}

// --- 1RM ---
const rmForm = reactive<{ exerciseId: string | null; kg: number | null }>({
  exerciseId: null,
  kg: null,
})

async function saveOneRm() {
  if (!rmForm.exerciseId || rmForm.kg == null) return
  try {
    await api.put('/api/player/one-rms', { exerciseId: rmForm.exerciseId, kg: rmForm.kg })
    rmForm.exerciseId = null
    rmForm.kg = null
    await refresh()
    toast.add({ title: '1RM guardado' })
  } catch (error) {
    toast.add({
      title: 'No se pudo guardar el 1RM',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  }
}

async function removeOneRm(exerciseId: string) {
  try {
    await api.del(`/api/player/one-rms/${exerciseId}`)
    await refresh()
  } catch (error) {
    toast.add({
      title: 'No se pudo borrar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  }
}

// --- canje del código ---
const inviteCode = ref('')

async function redeem() {
  try {
    await api.post('/api/player/redeem-invite', { code: inviteCode.value })
    inviteCode.value = ''
    await Promise.all([refresh(), refreshSession()])
    toast.add({ title: 'Listo', description: 'Ya estás vinculado a tu entrenador.' })
  } catch (error) {
    toast.add({
      title: 'No se pudo canjear el código',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  }
}

// --- contraseña ---
const passwordForm = reactive({ current: '', next: '', confirm: '' })
const changingPassword = ref(false)

async function submitPassword() {
  changingPassword.value = true
  try {
    await changePassword(passwordForm.current, passwordForm.next)
    passwordForm.current = ''
    passwordForm.next = ''
    passwordForm.confirm = ''
    toast.add({ title: 'Contraseña cambiada' })
  } catch (error) {
    toast.add({
      title: 'No se pudo cambiar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    changingPassword.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <h1 class="text-2xl font-bold">Mi perfil</h1>

    <!-- Sin coach: canje del código. La RPC redeem_invite_code es el ÚNICO
         camino para vincularse (el coach_id nunca llega por un PATCH). -->
    <UCard v-if="user && !user.coachId">
      <template #header>
        <h2 class="font-semibold">Vinculate a tu entrenador</h2>
      </template>
      <div class="flex items-end gap-2">
        <UFormField label="Código del entrenador" class="flex-1">
          <UInput v-model="inviteCode" placeholder="6 letras o números" class="w-full" />
        </UFormField>
        <UButton :disabled="!inviteCode" @click="redeem">Canjear</UButton>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">Mis datos</h2>
      </template>
      <UForm
        :schema="playerProfileSchema"
        :state="profileForm"
        class="space-y-4"
        @submit="saveProfile"
      >
        <UFormField label="Mi nombre" name="name">
          <UInput v-model="profileForm.name" class="w-full" />
        </UFormField>
        <UFormField label="Mi puesto" name="positionId">
          <USelect
            v-model="profileForm.positionId"
            :items="positionItems"
            placeholder="Elegí tu puesto"
            class="w-full"
          />
        </UFormField>
        <div class="flex gap-4">
          <UFormField label="Altura (cm)" name="heightCm" class="flex-1">
            <UInput v-model.number="profileForm.heightCm" type="number" class="w-full" />
          </UFormField>
          <UFormField label="Peso (kg)" name="weightKg" class="flex-1">
            <UInput
              v-model.number="profileForm.weightKg"
              type="number"
              step="0.1"
              class="w-full"
            />
          </UFormField>
        </div>
        <UButton type="submit">Guardar</UButton>
      </UForm>
      <p v-if="data?.profile.coachName" class="mt-4 text-sm text-muted">
        Tu entrenador: {{ data.profile.coachName }}
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">Mis 1RM</h2>
      </template>
      <p class="mb-4 text-sm text-muted">
        Tus 1RM son lo que convierte los porcentajes del programa en kilos concretos.
      </p>

      <div class="mb-4 flex items-end gap-2">
        <UFormField label="Ejercicio" class="flex-1">
          <ExerciseTypeahead v-model="rmForm.exerciseId" :exercises="exercises" />
        </UFormField>
        <UFormField label="Kg" class="w-24">
          <UInput v-model.number="rmForm.kg" type="number" step="0.5" min="0" class="w-full" />
        </UFormField>
        <UButton :disabled="!rmForm.exerciseId || rmForm.kg == null" @click="saveOneRm">
          Guardar
        </UButton>
      </div>

      <p v-if="(data?.oneRms.length ?? 0) === 0" class="text-sm text-muted">
        Todavía no cargaste ningún 1RM.
      </p>
      <ul v-else class="divide-y divide-default">
        <li
          v-for="rm in data!.oneRms"
          :key="rm.exerciseId"
          class="flex items-center justify-between py-2"
        >
          <span>{{ rm.exerciseName }}</span>
          <span class="flex items-center gap-3">
            <span class="font-medium">{{ rm.kg }} kg</span>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="xs"
              @click="removeOneRm(rm.exerciseId)"
            />
          </span>
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">Cambiar mi contraseña</h2>
      </template>
      <UForm
        :schema="changePasswordSchema"
        :state="passwordForm"
        class="space-y-4"
        @submit="submitPassword"
      >
        <UFormField label="Contraseña actual" name="current">
          <UInput v-model="passwordForm.current" type="password" class="w-full" />
        </UFormField>
        <UFormField label="Contraseña nueva" name="next">
          <UInput v-model="passwordForm.next" type="password" class="w-full" />
        </UFormField>
        <UFormField label="Repetí la nueva" name="confirm">
          <UInput v-model="passwordForm.confirm" type="password" class="w-full" />
        </UFormField>
        <UButton type="submit" :loading="changingPassword">Cambiar contraseña</UButton>
      </UForm>
    </UCard>
  </div>
</template>
