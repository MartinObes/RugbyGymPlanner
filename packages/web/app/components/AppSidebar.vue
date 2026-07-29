<script setup lang="ts">
import type { SessionUser } from '@coachlab/core/validators/auth'

const { user, logout } = useAuth()

type NavItem = { to: string; label: string; icon: string }

// Solo páginas que existen: Mi perfil se suma en F3.
const NAV: Record<SessionUser['role'], NavItem[]> = {
  COACH: [
    { to: '/coach/players', label: 'Plantel', icon: 'i-lucide-users' },
    { to: '/coach/groups', label: 'Grupos', icon: 'i-lucide-layout-grid' },
    { to: '/coach/programs', label: 'Programas', icon: 'i-lucide-clipboard-list' },
  ],
  PLAYER: [{ to: '/player/week', label: 'Mi semana', icon: 'i-lucide-calendar-days' }],
  ADMIN: [{ to: '/admin', label: 'Administración', icon: 'i-lucide-shield' }],
}

const items = computed(() => (user.value ? NAV[user.value.role] : []))
</script>

<template>
  <div>
    <!-- Desktop: sidebar fija -->
    <aside
      class="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-default bg-default p-4 md:flex"
    >
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold">CoachLab</span>
        <ColorModeToggle />
      </div>

      <nav class="mt-6 flex-1 space-y-1">
        <NuxtLink
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-elevated"
          active-class="bg-elevated font-medium text-primary"
        >
          <UIcon :name="item.icon" class="size-4" />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="border-t border-default pt-3">
        <p class="truncate text-sm font-medium">{{ user?.name }}</p>
        <p class="truncate text-xs text-muted">{{ user?.email }}</p>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-log-out"
          size="sm"
          class="mt-2"
          @click="logout"
        >
          Salir
        </UButton>
      </div>
    </aside>

    <!-- Mobile: barra inferior — los jugadores entran desde el celular. -->
    <nav class="fixed inset-x-0 bottom-0 z-10 flex border-t border-default bg-default md:hidden">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted"
        active-class="text-primary"
      >
        <UIcon :name="item.icon" class="size-5" />
        {{ item.label }}
      </NuxtLink>
      <button
        type="button"
        class="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted"
        @click="logout"
      >
        <UIcon name="i-lucide-log-out" class="size-5" />
        Salir
      </button>
    </nav>
  </div>
</template>
