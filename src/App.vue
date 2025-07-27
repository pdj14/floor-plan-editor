<template>
  <div id="app">
    <header class="app-header">
      <h1>🏠 Floor Plan Designer</h1>
      <div class="view-toggle">
        <button 
          @click="currentView = '2d'" 
          :class="{ active: currentView === '2d' }"
        >
          2D Editor
        </button>
        <button 
          @click="currentView = '3d'" 
          :class="{ active: currentView === '3d' }"
        >
          3D View
        </button>
        <button 
          @click="currentView = 'split'" 
          :class="{ active: currentView === 'split' }"
        >
          Split View
        </button>
      </div>
    </header>

    <main class="app-main" :class="currentView">
      <!-- 2D Editor -->
      <section v-show="currentView === '2d' || currentView === 'split'" class="editor-2d">
        <FloorPlanEditor2D />
      </section>

      <!-- 3D Viewer -->
      <section v-show="currentView === '3d' || currentView === 'split'" class="viewer-3d">
        <FloorPlanViewer3D />
      </section>
    </main>

    <!-- Object Library -->
    <aside class="object-library">
      <ObjectLibrary />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import FloorPlanEditor2D from './components/FloorPlanEditor2D.vue'
import FloorPlanViewer3D from './components/FloorPlanViewer3D.vue'
import ObjectLibrary from './components/ObjectLibrary.vue'

const currentView = ref<'2d' | '3d' | 'split'>('split')

// Store 기반으로 변경되어 viewer3D ref 불필요
// const viewer3D = ref<InstanceType<typeof FloorPlanViewer3D> | null>(null) -> 제거됨

onMounted(() => {
  console.log('🔧 App: 컴포넌트 마운트됨')
  console.log('ℹ️ App: Pinia Store 기반으로 데이터 관리. Make3D 버튼을 사용하세요.')
})

onUnmounted(() => {
  console.log('🔧 App: 컴포넌트 언마운트됨')
})
</script>

<style scoped>
#app {
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 1fr 300px;
  grid-template-areas: 
    "header header"
    "main sidebar";
}

.app-header {
  grid-area: header;
  background: #2c3e50;
  color: white;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.view-toggle {
  display: flex;
  gap: 0.5rem;
}

.view-toggle button {
  padding: 0.5rem 1rem;
  border: none;
  background: #34495e;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s;
}

.view-toggle button.active,
.view-toggle button:hover {
  background: #3498db;
}

.app-main {
  grid-area: main;
  display: grid;
  overflow: hidden;
}

.app-main.split {
  grid-template-columns: 1fr 1fr;
}

.app-main.2d,
.app-main.3d {
  grid-template-columns: 1fr;
}

.editor-2d,
.viewer-3d {
  border: 1px solid #ddd;
  overflow: hidden;
}

.object-library {
  grid-area: sidebar;
  background: #f8f9fa;
  border-left: 1px solid #ddd;
  overflow-y: auto;
}

h1 {
  margin: 0;
  font-size: 1.5rem;
}
</style>