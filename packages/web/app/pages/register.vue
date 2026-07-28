<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { registerSchema, type RegisterInput } from '@coachlab/core/validators/auth'

definePageMeta({ layout: 'auth' })

const { register, user } = useAuth()

const state = reactive({
  name: '',
  email: '',
  password: '',
  role: 'PLAYER' as 'PLAYER' | 'COACH',
  inviteCode: '',
})

const ROLE_ITEMS = [
  { label: 'Jugador', value: 'PLAYER' },
  { label: 'Entrenador', value: 'COACH' },
]

const formError = ref<string | null>(null)
const loading = ref(false)
const needsEmailConfirm = ref(false)

async function onSubmit(event: FormSubmitEvent<RegisterInput>) {
  formError.value = null
  loading.value = true
  try {
    const result = await register(event.data)
    if (result.needsEmailConfirm) {
      needsEmailConfirm.value = true
      return
    }
    await navigateTo(ROLE_HOME[user.value!.role])
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'No se pudo crear la cuenta'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <UAlert
      v-if="needsEmailConfirm"
      color="success"
      variant="subtle"
      title="Cuenta creada"
      description="Revisá tu correo para confirmarla y después entrá con tu email y contraseña."
    />

    <UForm
      v-else
      :schema="registerSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField label="Soy" name="role">
        <USelect v-model="state.role" :items="ROLE_ITEMS" class="w-full" />
      </UFormField>

      <UFormField label="Nombre" name="name">
        <UInput v-model="state.name" autocomplete="name" class="w-full" />
      </UFormField>

      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>

      <UFormField label="Contraseña" name="password" hint="Mínimo 8 caracteres">
        <UInput
          v-model="state.password"
          type="password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>

      <UFormField
        v-if="state.role === 'PLAYER'"
        label="Código de tu entrenador"
        name="inviteCode"
        hint="Te lo pasa tu entrenador"
      >
        <UInput
          v-model="state.inviteCode"
          placeholder="ABC234"
          maxlength="6"
          autocapitalize="characters"
          class="w-full font-mono uppercase"
        />
      </UFormField>

      <UAlert v-if="formError" color="error" variant="subtle" :title="formError" />

      <UButton type="submit" block :loading="loading">Crear cuenta</UButton>
    </UForm>

    <template #footer>
      <p class="text-center text-sm text-muted">
        ¿Ya tenés cuenta?
        <NuxtLink to="/login" class="font-medium text-primary">Entrá</NuxtLink>
      </p>
    </template>
  </UCard>
</template>
