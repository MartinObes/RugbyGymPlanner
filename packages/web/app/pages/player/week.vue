<script setup lang="ts">
const { user } = useAuth()
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Mi semana</h1>

    <!-- Jugador sin coach: el trigger no vincula si el código no matcheó. -->
    <UAlert
      v-if="user && !user.coachId"
      color="warning"
      variant="subtle"
      title="Tu cuenta no está vinculada a un entrenador"
      description="Pedile el código a tu entrenador. En la pantalla de perfil (próximamente) vas a poder ingresarlo."
    />

    <UCard v-else>
      <p class="text-muted">
        Todavía no tenés un programa asignado. Cuando tu entrenador te asigne uno, lo vas a ver acá.
      </p>
    </UCard>
  </div>
</template>
