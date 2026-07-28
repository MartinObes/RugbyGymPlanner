<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema, type LoginInput } from '@coachlab/core/validators/auth'

definePageMeta({ layout: 'auth' })

const { login, user } = useAuth()
const route = useRoute()

const state = reactive({ email: '', password: '' })
const formError = ref<string | null>(null)
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<LoginInput>) {
  formError.value = null
  loading.value = true
  try {
    await login(event.data)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
    await navigateTo(redirect ?? ROLE_HOME[user.value!.role])
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'No se pudo entrar'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <!-- El mismo schema Zod que valida en cualquier borde: no se redefine. -->
    <UForm :schema="loginSchema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>

      <UFormField label="Contraseña" name="password">
        <UInput
          v-model="state.password"
          type="password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>

      <UAlert v-if="formError" color="error" variant="subtle" :title="formError" />

      <UButton type="submit" block :loading="loading">Entrar</UButton>
    </UForm>

    <template #footer>
      <p class="text-center text-sm text-muted">
        ¿No tenés cuenta?
        <NuxtLink to="/register" class="font-medium text-primary">Registrate</NuxtLink>
      </p>
    </template>
  </UCard>
</template>
