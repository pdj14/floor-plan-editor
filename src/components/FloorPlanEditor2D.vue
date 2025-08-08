<template>
  <div class="editor-2d-container">
    <!-- 룸 생성 툴바 -->
    <div class="toolbar">
      <div class="room-controls">
        <h3>🏠 Room Creator</h3>
        <div class="size-inputs">
          <div class="input-group">
            <label>Width (m):</label>
            <input 
              v-model.number="roomWidth" 
              type="number" 
              min="1" 
              max="300" 
              step="0.5"
              placeholder="가로"
            />
          </div>
          <div class="input-group">
            <label>Height (m):</label>
            <input 
              v-model.number="roomHeight" 
              type="number" 
              min="1" 
              max="300" 
              step="0.5"
              placeholder="세로"
            />
          </div>
          <div class="color-swatches">
            <button 
              v-for="c in floorColors" 
              :key="c.hex" 
              type="button"
              class="swatch"
              :class="{ selected: selectedFloorColor.hex === c.hex }"
              :style="{ backgroundColor: c.hex }"
              @click="selectedFloorColor = c"
              :title="c.label"
            />
          </div>
          <button @click="createRoom" class="btn btn-primary" :disabled="!isValidSize">
            🏗️ Create Room
          </button>
        </div>
      </div>



      <div class="wall-tools">
        <h4>🧱 Wall Tools</h4>
        <div class="tool-buttons">
          <button 
            @click="() => { currentTool = 'select' }" 
            :class="['btn', 'btn-secondary', { active: currentTool === 'select' }]"
            title="Select and Edit Walls"
          >
            👆 Select
          </button>
          <button 
            @click="() => { currentTool = 'wall' }" 
            :class="['btn', 'btn-secondary', { active: currentTool === 'wall' }]"
            title="Draw New Interior Walls"
          >
            🧱 Draw Wall
          </button>
          <button 
            @click="deleteSelectedObject" 
            :disabled="!selectedObject"
            class="btn btn-danger"
            title="Delete Selected Object"
          >
            🗑️ Delete
          </button>
        </div>
        <div v-if="selectedObject" class="selection-info">
          <small v-if="selectedObject.userData?.type === 'placed-object'">
            ✅ Object "{{ selectedObject.userData?.objectName }}" selected - Press Delete or click button to remove
          </small>
          <small v-else>
            ✅ {{ selectedObject.userData?.type === 'exterior-wall' ? 'Exterior Wall' : 'Interior Wall' }} selected 
            ({{ selectedObject.userData?.position || 'custom' }}) - Press Delete or click button to remove
          </small>
        </div>
        

        
        <div class="tool-info">
          <small v-if="currentTool === 'select'">
            🛠️ <strong>Select Mode:</strong> Click walls or objects to select and move them. Use Delete to remove selected items.
          </small>
          <small v-else-if="currentTool === 'wall'">
            🛠️ <strong>Draw Mode (Active):</strong> Click and drag on canvas to draw new walls. Existing items are not selectable.
          </small>
        </div>
        
        <!-- 디버깅용 정보 -->
        <div v-if="currentTool === 'wall'" class="debug-info">
          <small>🐛 Debug: Tool = "{{ currentTool }}", Canvas = {{ !!fabricCanvas ? 'Ready' : 'Not Ready' }}</small>
        </div>
      </div>
      
      <div class="tool-group">
        <button @click="resetView" class="btn btn-secondary" title="Reset zoom and pan">
          🔍 Reset View
        </button>
        <button @click="clearCanvas" class="btn btn-secondary">
          🗑️ Clear
        </button>
        <button @click="exportFloorPlan" class="btn btn-primary">
          💾 Export
        </button>
      </div>
    </div>

    <!-- 캔버스 영역 -->
    <div class="canvas-wrapper" ref="canvasWrapper">
      <canvas ref="canvas2d" />
    </div>

    <!-- 상태바 -->
    <div class="statusbar">
      <span>🏠 Room Size: {{ roomWidth }}m × {{ roomHeight }}m</span>
      <span>🛠️ Tool: {{ getCurrentToolName() }} {{ currentTool === 'select' ? '(Edit Mode)' : '(Draw Mode)' }}</span>
      <span>📐 Grid: 1칸 = 50cm</span>
      <span>🖱️ Mouse: ({{ mousePosition.x }}, {{ mousePosition.y }})</span>
      <span>🔍 Zoom: {{ (zoom * 100).toFixed(0) }}%</span>
      <span>📱 Pan: ({{ pan.x.toFixed(0) }}, {{ pan.y.toFixed(0) }})</span>
      <span v-if="floorplanStore.hasRoom">✅ Created: {{ floorplanStore.currentRoom?.width }}m × {{ floorplanStore.currentRoom?.height }}m</span>
      <span v-if="boxPlacementMode" class="box-mode-indicator">📦 Box Mode: 장비를 상자 위에 배치할 수 있습니다</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import * as fabricLib from 'fabric'
import { useFloorplanStore } from '../stores/floorplanStore'

// Fabric.js v5 호환성을 위한 처리
const fabric = (fabricLib as any).fabric || fabricLib

// Pinia Store 사용
const floorplanStore = useFloorplanStore()

// 상태 관리
const canvas2d = ref<HTMLCanvasElement>()
const canvasWrapper = ref<HTMLDivElement>()
let fabricCanvas: any = null

const roomWidth = ref(10)  // 기본 가로 10m
const roomHeight = ref(10) // 기본 세로 10m
const floorColors = ref([
  { label: 'Pastel Yellow', hex: '#FFE082', rgba: 'rgba(255, 224, 130, 0.65)' },
  { label: 'Pastel Mint',   hex: '#80DEEA', rgba: 'rgba(128, 222, 234, 0.65)' },
  { label: 'Pastel Green',  hex: '#A5D6A7', rgba: 'rgba(165, 214, 167, 0.65)' },
  { label: 'Pastel Pink',   hex: '#F8BBD0', rgba: 'rgba(248, 187, 208, 0.65)' },
  { label: 'Pastel Blue',   hex: '#90CAF9', rgba: 'rgba(144, 202, 249, 0.65)' }
])
const selectedFloorColor = ref<{label: string; hex: string; rgba: string}>(floorColors.value[0])
const currentTool = ref('select')
const mousePosition = ref({ x: 0, y: 0 })
const selectedObject = ref<any>(null)
const selectedBox = ref<any>(null) // 선택된 상자
const boxPlacementMode = ref(false) // 상자 위 장비 배치 모드

// 확대/축소 및 이동 관련 상태
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const isPanning = ref(false)
const lastPanPoint = ref({ x: 0, y: 0 })


// Store에서 직접 사용할 데이터들 (로컬 state 제거)
// const currentRoom = ref<{width: number, height: number, bounds?: any} | null>(null) -> store 사용
// const interiorWalls = ref<any[]>([]) -> store 사용

// 크기 유효성 검사
const isValidSize = computed(() => {
  return roomWidth.value > 0 && roomHeight.value > 0 && 
         roomWidth.value <= 300 && roomHeight.value <= 300
})

// 현재 도구 이름
const getCurrentToolName = () => {
  switch (currentTool.value) {
    case 'select': return 'Select'
    case 'wall': return 'Draw Wall'
    default: return 'Unknown'
  }
}

// Throttle 함수 (성능 최적화)
const throttle = (func: Function, delay: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastExecTime = 0
  
  return (...args: any[]) => {
    const currentTime = Date.now()
    
    if (currentTime - lastExecTime > delay) {
      func.apply(null, args)
      lastExecTime = currentTime
    } else {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        func.apply(null, args)
        lastExecTime = Date.now()
      }, delay)
    }
  }
}

// 실시간 3D 업데이트 제거로 인해 throttledUpdate3D 함수 제거
// const throttledUpdate3D = throttle(() => {
//   console.log('🔄 Throttled 3D 업데이트 실행')
//   updateAllWalls()
// }, 300)

// 캔버스 초기화
const initCanvas = () => {
  if (!canvas2d.value || !canvasWrapper.value) return

  const wrapper = canvasWrapper.value
  const width = wrapper.clientWidth
  const height = wrapper.clientHeight

  fabricCanvas = new fabric.Canvas(canvas2d.value, {
    width,
    height,
    backgroundColor: '#ffffff',
    selection: true,
  })

  // Store에 캔버스 크기 저장
  floorplanStore.setCanvasSize({ width, height })

  // 캔버스 포커스 설정을 더 강력하게
  fabricCanvas.upperCanvasEl.setAttribute('tabindex', '0')
  fabricCanvas.upperCanvasEl.style.outline = 'none'
  
  // 그리드 배경 추가
  addGrid()
  
  // 초기 커서 스타일 설정
  if (canvasWrapper.value) {
    canvasWrapper.value.classList.remove('drawing-mode')
  }

  // 이벤트 리스너
  fabricCanvas.on('mouse:move', (e: any) => {
    const pointer = fabricCanvas!.getPointer(e.e)
    mousePosition.value = { 
      x: Math.round(pointer.x), 
      y: Math.round(pointer.y) 
    }
  })
  
  // 패닝을 위한 별도의 mousemove 이벤트
  fabricCanvas.upperCanvasEl.addEventListener('mousemove', (e: any) => {
    if (isPanning.value) {
      const deltaX = e.clientX - lastPanPoint.value.x
      const deltaY = e.clientY - lastPanPoint.value.y
      
      pan.value.x += deltaX
      pan.value.y += deltaY
      lastPanPoint.value = { x: e.clientX, y: e.clientY }
      
      updateCanvasTransform()
    }
  })

  // 오브젝트 이동 이벤트 리스너
  fabricCanvas.on('object:modified', (e: any) => {
    const modifiedObject = e.target
    if (modifiedObject && modifiedObject.userData?.type === 'placed-object') {
      updatePlacedObjectInStore(modifiedObject)
      
      // 상자가 이동하거나 회전한 경우 그 위의 장비들도 함께 이동/회전
      if (modifiedObject.userData?.category === 'etc' && modifiedObject.userData?.isBox) {
        moveObjectsOnBox(modifiedObject)
      }
    }
  })

  // 벽 그리기 이벤트 설정
  setupWallDrawing()
  
  // 확대/축소 및 이동 이벤트 설정
  setupZoomAndPanEvents()

  // 다중 키보드 이벤트 설정 (더 확실하게)
  setupKeyboardEvents()
}

// 키보드 이벤트 설정 (다중 방법)
const setupKeyboardEvents = () => {
  if (!fabricCanvas) return
  
  // 방법 1: 캔버스 엘리먼트에 직접
  fabricCanvas.upperCanvasEl.addEventListener('keydown', handleCanvasKeydown)
  
  // 방법 2: 캔버스 래퍼에도 추가
  if (canvasWrapper.value) {
    canvasWrapper.value.addEventListener('keydown', handleCanvasKeydown)
    canvasWrapper.value.setAttribute('tabindex', '0')
    canvasWrapper.value.style.outline = 'none'
  }
  
  // 방법 3: document 레벨에서도 처리 (캔버스가 포커스된 경우에만)
  document.addEventListener('keydown', handleGlobalKeydown)
  
  // 캔버스 포커스 이벤트들
  fabricCanvas.upperCanvasEl.addEventListener('click', focusCanvas)
  fabricCanvas.upperCanvasEl.addEventListener('mousedown', focusCanvas)
  
  if (canvasWrapper.value) {
    canvasWrapper.value.addEventListener('click', focusCanvas)
  }
}

// 캔버스 포커스 함수
const focusCanvas = () => {
  if (fabricCanvas) {
    fabricCanvas.upperCanvasEl.focus()
  }
  if (canvasWrapper.value) {
    canvasWrapper.value.focus()
  }
}

// 전역 키보드 이벤트 처리 (캔버스 포커스 시에만)
const handleGlobalKeydown = (e: KeyboardEvent) => {
  // 캔버스나 래퍼가 포커스된 경우에만 처리
  const activeElement = document.activeElement
  const isCanvasFocused = activeElement === fabricCanvas?.upperCanvasEl || 
                         activeElement === canvasWrapper.value
  
  if (isCanvasFocused && (e.key === 'Delete' || e.key === 'Backspace')) {
    handleCanvasKeydown(e)
  }
}

// 캔버스 키보드 이벤트 처리
const handleCanvasKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Delete') {
      e.preventDefault()
    deleteSelectedObject()
  }
}

// 확대/축소 및 이동 이벤트 설정
const setupZoomAndPanEvents = () => {
  if (!fabricCanvas) return
  
  // 마우스 휠 이벤트 (확대/축소)
  fabricCanvas.on('mouse:wheel', (e: any) => {
    e.e.preventDefault()
    
    // 벽 그리기 모드에서는 확대/축소 비활성화
    if (currentTool.value === 'wall') {
      return
    }
    
    const delta = e.e.deltaY
    const zoomFactor = 0.1
    const newZoom = delta > 0 ? zoom.value * (1 - zoomFactor) : zoom.value * (1 + zoomFactor)
    
    // 최소/최대 확대 제한
    const minZoom = 0.1
    const maxZoom = 5
    zoom.value = Math.max(minZoom, Math.min(maxZoom, newZoom))
    
    updateCanvasTransform()
  })
  
  // 마우스 오른쪽 클릭 이벤트 (이동) - 네이티브 DOM 이벤트 사용
  fabricCanvas.upperCanvasEl.addEventListener('mousedown', (e: any) => {
    if (e.button === 2) { // 오른쪽 클릭
      e.preventDefault()
      
      // 벽 그리기 모드에서는 이동 비활성화
      if (currentTool.value === 'wall') {
        return
      }
      
      isPanning.value = true
      const rect = fabricCanvas.upperCanvasEl.getBoundingClientRect()
      lastPanPoint.value = { x: e.clientX, y: e.clientY }
      fabricCanvas.defaultCursor = 'grabbing'
    }
  })
  
  fabricCanvas.upperCanvasEl.addEventListener('mouseup', (e: any) => {
    if (e.button === 2) { // 오른쪽 클릭 해제
      isPanning.value = false
      fabricCanvas.defaultCursor = 'default'

    }
  })
  
  // 컨텍스트 메뉴 비활성화
  fabricCanvas.upperCanvasEl.addEventListener('contextmenu', (e: any) => {
    e.preventDefault()
  })
}

// 캔버스 변환 업데이트 (확대/축소 및 이동)
const updateCanvasTransform = () => {
  if (!fabricCanvas) return
  
  // 캔버스 뷰포트 변환
  fabricCanvas.setViewportTransform([
    zoom.value,
    0,
    0,
    zoom.value,
    pan.value.x,
    pan.value.y
  ])
  
  // 그리드 업데이트
  updateGrid()
  
  fabricCanvas.renderAll()
}

// 모든 바닥을 가장 뒤 레이어로 보냄
const sendAllFloorsToBack = () => {
  if (!fabricCanvas) return
  const floors = fabricCanvas.getObjects().filter((o: any) => o.userData?.type === 'room-floor')
  floors.forEach((f: any) => {
    // 항상 화면의 가장 뒤로
    fabricCanvas.moveTo(f, 0)
    f.selectable = true
    f.evented = true
  })
}

// 그리드를 모든 바닥 바로 위로 이동
const positionGridAfterFloors = () => {
  if (!fabricCanvas) return
  const grid = fabricCanvas.getObjects().find((obj: any) => obj.type === 'group' && obj.getObjects?.().some((line: any) => line.type === 'line'))
  if (!grid) return
  const objs = fabricCanvas.getObjects()
  const floorIndices = (objs
    .map((o: any, idx: number) => ({ o, idx })) as Array<{ o: any; idx: number }>)
    .filter((x: { o: any; idx: number }) => x.o.userData?.type === 'room-floor')
    .map((x: { o: any; idx: number }) => x.idx)
  const maxFloorIndex = floorIndices.length ? Math.max(...floorIndices) : -1
  if (maxFloorIndex >= 0) {
    fabricCanvas.moveTo(grid, maxFloorIndex + 1)
  } else {
    fabricCanvas.moveTo(grid, 0)
  }
  // 오브젝트는 항상 바닥/그리드 보다 앞쪽 (유지): 바닥/그리드 외의 요소를 앞으로
  const others = objs.filter((o: any) => !(o.userData?.type === 'room-floor') && !(o === grid))
  others.forEach((o: any, i: number) => fabricCanvas.moveTo(o, maxFloorIndex + 2 + i))
}

// 벽 그리기 이벤트 설정
const setupWallDrawing = () => {
  if (!fabricCanvas) {
    return
  }

  let isDrawing = false
  let startPoint: any = null
  let currentLine: any = null

  fabricCanvas.on('selection:created', (e: any) => {
    const selected = e.selected[0]
    console.log('🎯 오브젝트 선택됨:', selected?.userData)
    
    // placed-object는 두 모드에서 모두 선택 가능
    if (selected && selected.userData?.type === 'placed-object') {
      selectedObject.value = selected
      console.log('✅ 배치된 오브젝트 선택:', selected.userData?.placedObjectId)
      
      // ETC 상자가 선택된 경우 상자 위 장비 배치 모드 활성화
      if (selected.userData?.category === 'etc' && selected.userData?.isBox) {
        selectedBox.value = selected
        boxPlacementMode.value = true
        console.log('📦 상자 선택됨 - 장비 배치 모드 활성화')
      } else {
        // 상자가 아닌 오브젝트 선택 시 상자 모드 비활성화
        selectedBox.value = null
        boxPlacementMode.value = false
        
        // 상자 위에 배치된 장비가 선택된 경우 해당 상자도 함께 선택
        if (selected.userData?.isOnBox && selected.userData?.boxId) {
          const fabricObjects = fabricCanvas.getObjects()
          const boxObject = fabricObjects.find((fabricObj: any) => 
            fabricObj.userData?.placedObjectId === selected.userData?.boxId
          )
          if (boxObject) {
            fabricCanvas.setActiveObject(boxObject)
            console.log('📦 상자 위 장비 선택으로 인한 상자도 함께 선택')
          }
        }
      }
      return
    }
    // 바닥 선택 허용
    if (selected && selected.userData?.type === 'room-floor') {
      selectedObject.value = selected
      return
    }
    
    // 벽은 select 모드에서만 선택 가능
    if (currentTool.value !== 'select') {
      fabricCanvas.discardActiveObject()
      selectedObject.value = null
      return
    }
    
    if (selected && (selected.userData?.type === 'interior-wall' || selected.userData?.type === 'exterior-wall')) {
      selectedObject.value = selected
      console.log('✅ 벽 선택:', selected.userData?.type)
    } else {
      selectedObject.value = null
      console.log('❌ 선택 해제')
    }
  })

  fabricCanvas.on('selection:updated', (e: any) => {
    const selected = e.selected[0]
    
    // placed-object는 두 모드에서 모두 선택 가능
    if (selected && selected.userData?.type === 'placed-object') {
      selectedObject.value = selected
      return
    }
    // 바닥 선택 허용
    if (selected && selected.userData?.type === 'room-floor') {
      selectedObject.value = selected
      return
    }
    
    // 벽은 select 모드에서만 선택 가능
    if (currentTool.value !== 'select') {
      fabricCanvas.discardActiveObject()
      selectedObject.value = null
      return
    }
    
    if (selected && (selected.userData?.type === 'interior-wall' || selected.userData?.type === 'exterior-wall')) {
      selectedObject.value = selected
    } else {
      selectedObject.value = null
    }
  })

  fabricCanvas.on('selection:cleared', () => {
    selectedObject.value = null
  })

  updateWallSelectability()

  fabricCanvas.on('object:modified', (e: any) => {
    const modifiedObject = e.target
    if (modifiedObject && (modifiedObject.userData?.type === 'interior-wall' || modifiedObject.userData?.type === 'exterior-wall')) {
      const wallType = modifiedObject.userData?.type === 'interior-wall' ? '내부 벽' : '외부 벽'
      updateInteriorWallInList(modifiedObject)
    } else if (modifiedObject && modifiedObject.userData?.type === 'placed-object') {
      updatePlacedObjectInStore(modifiedObject)
    }
  })

  fabricCanvas.on('object:moving', (e: any) => {
    const movingObject = e.target
    if (movingObject && (movingObject.userData?.type === 'interior-wall' || movingObject.userData?.type === 'exterior-wall')) {
      const wallType = movingObject.userData?.type === 'interior-wall' ? '내부 벽' : '외부 벽'
      updateInteriorWallInList(movingObject)
    } else if (movingObject && movingObject.userData?.type === 'placed-object') {
      updatePlacedObjectInStore(movingObject)
    }
  })

  fabricCanvas.on('object:scaling', (e: any) => {
    const scalingObject = e.target
    if (scalingObject && (scalingObject.userData?.type === 'interior-wall' || scalingObject.userData?.type === 'exterior-wall')) {
      const wallType = scalingObject.userData?.type === 'interior-wall' ? '내부 벽' : '외부 벽'
      updateInteriorWallInList(scalingObject)
    }
  })

  fabricCanvas.on('object:rotating', (e: any) => {
    const rotatingObject = e.target
    if (rotatingObject && (rotatingObject.userData?.type === 'interior-wall' || rotatingObject.userData?.type === 'exterior-wall')) {
      const wallType = rotatingObject.userData?.type === 'interior-wall' ? '내부 벽' : '외부 벽'
      updateInteriorWallInList(rotatingObject)
    } else if (rotatingObject && rotatingObject.userData?.type === 'placed-object') {
      updatePlacedObjectInStore(rotatingObject)
    }
  })

  fabricCanvas.on('mouse:down', (e: any) => {
    if (currentTool.value !== 'wall') {
      return
    }

    const pointer = fabricCanvas.getPointer(e.e)
    isDrawing = true
    startPoint = pointer

    currentLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
      stroke: '#666666',
      strokeWidth: 3 / zoom.value, // 확대/축소에 따른 선 두께 조정
      strokeLineCap: 'round',
      selectable: false,
      evented: false,
      opacity: 0.7,
    })

    fabricCanvas.add(currentLine)
  })

  fabricCanvas.on('mouse:move', (e: any) => {
    if (!isDrawing || !currentLine || !startPoint) {
      return
    }

    const pointer = fabricCanvas.getPointer(e.e)
    currentLine.set({ x2: pointer.x, y2: pointer.y })
    fabricCanvas.renderAll()
  })

  fabricCanvas.on('mouse:up', (e: any) => {
    if (!isDrawing || !startPoint || !currentLine) {
      return
    }

    const pointer = fabricCanvas.getPointer(e.e)
    
    const length = Math.sqrt(
      Math.pow(pointer.x - startPoint.x, 2) + 
      Math.pow(pointer.y - startPoint.y, 2)
    )

    if (length < 20) {
      fabricCanvas.remove(currentLine)
    } else {
      fabricCanvas.remove(currentLine)
      addInteriorWall(startPoint, pointer)
    }

    isDrawing = false
    startPoint = null
    currentLine = null
  })
}

// Store를 사용한 벽 정보 업데이트 (내부벽/외부벽 모두 처리)
const updateInteriorWallInList = (modifiedWall: any) => {
  
  const wallId = modifiedWall.userData?.id
  const wallType = modifiedWall.userData?.type
  
  if (!wallId) {
    return
  }

  let startPoint, endPoint

  // 벽 타입에 따라 좌표 계산 방법 분기 (내부벽과 외부벽 모두 Line 객체로 통일)
  if (wallType === 'interior-wall' || wallType === 'exterior-wall') {
    // 내부벽과 외부벽 모두 Line 객체로 동일하게 처리
    const linePoints = modifiedWall.calcLinePoints()
    const matrix = modifiedWall.calcTransformMatrix()
    startPoint = fabric.util.transformPoint({ x: linePoints.x1, y: linePoints.y1 }, matrix)
    endPoint = fabric.util.transformPoint({ x: linePoints.x2, y: linePoints.y2 }, matrix)
  } else {
    return
  }
  
    const updatedWall = {
    start: { x: startPoint.x, y: startPoint.y },
    end: { x: endPoint.x, y: endPoint.y },
      id: wallId
    }
    
  if (wallType === 'interior-wall') {
    floorplanStore.updateInteriorWall(wallId, updatedWall)
  } else if (wallType === 'exterior-wall') {
    floorplanStore.updateExteriorWall(wallId, updatedWall)
  }
  
  updateWallLengthLabel(modifiedWall)
}

// 그리드 배경 추가
const addGrid = () => {
  if (!fabricCanvas) return

  const gridSize = 20 // 0.5m = 20px (1칸에 50cm)
  const width = fabricCanvas.width!
  const height = fabricCanvas.height!

  const lines = []

  // 세로선 (50cm 간격)
  for (let i = 0; i <= width; i += gridSize) {
    lines.push(new fabric.Line([i, 0, i, height], {
      stroke: '#c0c0c0',
      strokeWidth: 1,
      selectable: false,
      evented: false,
    }))
  }

  // 가로선 (50cm 간격)
  for (let i = 0; i <= height; i += gridSize) {
    lines.push(new fabric.Line([0, i, width, i], {
      stroke: '#c0c0c0',
      strokeWidth: 1,
      selectable: false,
      evented: false,
    }))
  }

  // 굵은 그리드 (2.5m 간격)
  for (let i = 0; i <= width; i += gridSize * 5) {
    lines.push(new fabric.Line([i, 0, i, height], {
      stroke: '#a0a0a0',
      strokeWidth: 2,
      selectable: false,
      evented: false,
    }))
  }

  for (let i = 0; i <= height; i += gridSize * 5) {
    lines.push(new fabric.Line([0, i, width, i], {
      stroke: '#a0a0a0',
      strokeWidth: 2,
      selectable: false,
      evented: false,
    }))
  }

  const grid = new fabric.Group(lines, {
    selectable: false,
    evented: false,
  })

  fabricCanvas.add(grid)
  // 레이어 정렬: 모든 바닥 뒤, 그 위에 그리드, 그 위에 오브젝트
  positionGridAfterFloors()
}

// 확대/축소 및 이동에 따른 그리드 업데이트
const updateGrid = () => {
  if (!fabricCanvas) return
  
  // 기존 그리드 제거
  const existingGrid = fabricCanvas.getObjects().find((obj: any) => 
    obj.type === 'group' && obj.getObjects().some((line: any) => line.type === 'line')
  )
  
  if (existingGrid) {
    fabricCanvas.remove(existingGrid)
  }
  
  // 새로운 그리드 생성 (확대/축소 및 이동을 고려한 확장된 영역)
  const gridSize = 20 * zoom.value // 확대/축소에 따른 그리드 크기 조정
  const canvasWidth = fabricCanvas.width!
  const canvasHeight = fabricCanvas.height!
  
  // 뷰포트 영역 계산
  const viewportLeft = -pan.value.x / zoom.value
  const viewportTop = -pan.value.y / zoom.value
  const viewportRight = viewportLeft + canvasWidth / zoom.value
  const viewportBottom = viewportTop + canvasHeight / zoom.value
  
  // 그리드 시작/끝 위치 계산 (여백 포함)
  const margin = 1000 // 여백 크기
  const startX = Math.floor((viewportLeft - margin) / gridSize) * gridSize
  const endX = Math.ceil((viewportRight + margin) / gridSize) * gridSize
  const startY = Math.floor((viewportTop - margin) / gridSize) * gridSize
  const endY = Math.ceil((viewportBottom + margin) / gridSize) * gridSize
  
  const lines = []
  
  // 세로선 (50cm 간격)
  for (let i = startX; i <= endX; i += gridSize) {
    lines.push(new fabric.Line([i, startY, i, endY], {
      stroke: '#c0c0c0',
      strokeWidth: 1,
      selectable: false,
      evented: false,
    }))
  }
  
  // 가로선 (50cm 간격)
  for (let i = startY; i <= endY; i += gridSize) {
    lines.push(new fabric.Line([startX, i, endX, i], {
      stroke: '#c0c0c0',
      strokeWidth: 1,
      selectable: false,
      evented: false,
    }))
  }
  
  // 굵은 그리드 (2.5m 간격)
  for (let i = startX; i <= endX; i += gridSize * 5) {
    lines.push(new fabric.Line([i, startY, i, endY], {
      stroke: '#a0a0a0',
      strokeWidth: 2,
      selectable: false,
      evented: false,
    }))
  }
  
  for (let i = startY; i <= endY; i += gridSize * 5) {
    lines.push(new fabric.Line([startX, i, endX, i], {
      stroke: '#a0a0a0',
      strokeWidth: 2,
      selectable: false,
      evented: false,
    }))
  }
  
  const grid = new fabric.Group(lines, {
    selectable: false,
    evented: false,
  })
  
  fabricCanvas.add(grid)
  positionGridAfterFloors()
}

// Store를 사용한 내부 벽 추가
const addInteriorWall = (start: { x: number, y: number }, end: { x: number, y: number }) => {
  if (!fabricCanvas) return

  // 현재 툴에 따라 선택 가능 여부 및 시각적 스타일 결정
  const isSelectMode = currentTool.value === 'select'

  const wall = new fabric.Line([start.x, start.y, end.x, end.y], {
    stroke: isSelectMode ? '#444444' : '#666666', // Select 모드: 더 진한 회색, Draw 모드: 진한 회색
    strokeWidth: 3,
    strokeLineCap: 'round',
    selectable: isSelectMode,
    evented: isSelectMode,
    opacity: isSelectMode ? 1.0 : 0.7, // Select 모드: 불투명, Draw 모드: 반투명
    hoverCursor: isSelectMode ? 'move' : 'default',
    moveCursor: isSelectMode ? 'move' : 'default',
  })

  // 더 상세한 식별 정보 추가
  const wallId = Date.now() + Math.random() // 고유 ID
  wall.userData = { 
    type: 'interior-wall',
    id: wallId,
    startX: start.x,
    startY: start.y,
    endX: end.x,
    endY: end.y
  }
  
  fabricCanvas.add(wall)
  
  // Store에 내부 벽 추가
  const wallData = {
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    id: wallId
  }
  
  floorplanStore.addInteriorWall(wallData)

  addWallLengthLabel(wall, start, end)
  
  // 새로 생성된 벽의 선택 가능 여부를 현재 툴에 맞게 설정
  updateWallSelectability()
}



// Store를 사용한 네모난 방 생성 (바닥만 생성, 벽 미생성)
const createRoom = () => {
  if (!fabricCanvas || !isValidSize.value) return

  // 기존 도면은 유지하고 바닥만 추가 (여러 바닥 지원)

  const scale = 40 // 1m = 40px
  const roomWidthPx = roomWidth.value * scale
  const roomHeightPx = roomHeight.value * scale

  // 캔버스 중앙에 배치
  const canvasWidth = fabricCanvas.width!
  const canvasHeight = fabricCanvas.height!
  const startX = (canvasWidth - roomWidthPx) / 2
  const startY = (canvasHeight - roomHeightPx) / 2

  // 바닥(직사각형) 생성 - 파스텔톤 노란색 (반투명)
  const floorId = Date.now().toString()
  const floorRect = new fabric.Rect({
    left: startX,
    top: startY,
    width: roomWidthPx,
    height: roomHeightPx,
    fill: selectedFloorColor.value.rgba,
    stroke: '#E5D38A', // 테두리는 살짝 어둡게
    strokeWidth: 1,
    selectable: true,
    hasControls: true,
    lockRotation: true,
    evented: true
  })
  ;(floorRect as any).userData = { type: 'room-floor', floorId }
  fabricCanvas.add(floorRect)

  // 바닥 사이즈 라벨 추가
  addOrUpdateRoomSizeLabel(floorRect)

  // 바닥 이동/리사이즈 처리 분리 (이동 시 크기 변경 금지)
  floorRect.on('moving', () => handleFloorMoving(floorRect))
  floorRect.on('modified', () => handleFloorModified(floorRect))

  // 선택/해제 시 UI 연동 (Delete 버튼 활성화)
  floorRect.on('selected', () => { selectedObject.value = floorRect })
  floorRect.on('deselected', () => { if (selectedObject.value === floorRect) selectedObject.value = null })
  // 바닥 클릭 시에도 즉시 레이어 정렬 유지
  floorRect.on('mousedown', () => {
    sendAllFloorsToBack()
    positionGridAfterFloors()
  })

  // 레이어: 바닥은 항상 가장 뒤로
  sendAllFloorsToBack()
  // 그리드를 바닥 위로 정렬
  positionGridAfterFloors()

  // Store에 룸 정보 업데이트 (bounds는 그대로 유지)
  const roomData = {
    width: roomWidth.value,
    height: roomHeight.value,
    bounds: {
      left: startX,
      top: startY,
      right: startX + roomWidthPx,
      bottom: startY + roomHeightPx
    }
  }
  floorplanStore.setRoom(roomData)

  // Store floors에도 추가 (여러 바닥 지원)
  floorplanStore.addFloor({
    id: floorId,
    width: roomWidth.value,
    height: roomHeight.value,
    boundsPx: { left: startX, top: startY, right: startX + roomWidthPx, bottom: startY + roomHeightPx },
    color: selectedFloorColor.value.hex
  })

  // 외부벽 데이터는 생성하지 않음 (요청사항)

  fabricCanvas.renderAll()
}

// 바닥 사이즈 라벨 생성/업데이트
const addOrUpdateRoomSizeLabel = (floorRect: any) => {
  if (!fabricCanvas) return
  const scale = 40
  const widthM = (floorRect.width * floorRect.scaleX) / scale
  const heightM = (floorRect.height * floorRect.scaleY) / scale
  const area = Math.round(widthM * heightM * 100) / 100
  const labelText = `W ${widthM.toFixed(2)}m × D ${heightM.toFixed(2)}m  |  Area ${area.toFixed(2)} m²`

  // 기존 라벨 찾기 (floor별)
  const floorId = floorRect.userData?.floorId
  const existing = fabricCanvas.getObjects().find((o: any) => o.userData?.type === 'room-size-label' && o.userData?.floorId === floorId) as any
  if (existing) {
    existing.text = labelText
    existing.left = floorRect.left + 8
    existing.top = floorRect.top + 8
    existing.bringToFront()
  } else {
    const label = new fabric.Text(labelText, {
      left: floorRect.left + 8,
      top: floorRect.top + 8,
      fontSize: 14,
      fill: '#5c5c5c',
      backgroundColor: 'rgba(255,255,255,0.6)'
    }) as any
    label.userData = { type: 'room-size-label', floorId }
    fabricCanvas.add(label)
    label.bringToFront()
  }
}

// 바닥 이동/리사이즈 후 스토어 바닥/라벨만 업데이트 (다른 요소 영향 없음)
const handleFloorModified = (floorRect: any) => {
  if (!fabricCanvas) return
  const scale = 40

  // 변경된 실제 크기 픽셀 → 고정 폭/높이로 반영하고 scale 초기화
  const newWidthPx = floorRect.getScaledWidth()
  const newHeightPx = floorRect.getScaledHeight()
  floorRect.set({ width: newWidthPx, height: newHeightPx, scaleX: 1, scaleY: 1 })

  // 새로운 룸 크기 (미터)
  const newWm = newWidthPx / scale
  const newDm = newHeightPx / scale

  // floors 스토어 업데이트 (현재 floorId 기준)
  const floorId = floorRect.userData?.floorId as string
  if (floorId) {
    floorplanStore.updateFloor(floorId, {
      width: newWm,
      height: newDm,
      boundsPx: {
        left: floorRect.left,
        top: floorRect.top,
        right: floorRect.left + newWidthPx,
        bottom: floorRect.top + newHeightPx
      }
    })
  }

  // 라벨 업데이트
  addOrUpdateRoomSizeLabel(floorRect)

  // 다른 요소에는 영향 없음. 2D 재구성 불필요

  fabricCanvas.renderAll()
}

// 바닥 이동 중에는 크기를 고정하고, 위치만 반영
const handleFloorMoving = (floorRect: any) => {
  if (!fabricCanvas) return
  const scale = 40
  // 크기 스케일 잠금
  if (floorRect.scaleX !== 1 || floorRect.scaleY !== 1) {
    const w = floorRect.getScaledWidth()
    const h = floorRect.getScaledHeight()
    floorRect.set({ width: w, height: h, scaleX: 1, scaleY: 1 })
  }
  // 위치만 floors 스토어에 반영
  const floorId = floorRect.userData?.floorId as string
  if (!floorId) return
  const newBounds = {
    left: floorRect.left,
    top: floorRect.top,
    right: floorRect.left + floorRect.width,
    bottom: floorRect.top + floorRect.height
  }
  floorplanStore.updateFloor(floorId, { boundsPx: newBounds })
  // 라벨도 함께 이동
  addOrUpdateRoomSizeLabel(floorRect)
  // 레이어 정렬 유지
  sendAllFloorsToBack()
  positionGridAfterFloors()
}

// 실시간 3D 업데이트 제거로 인해 updateAllWalls 함수 비활성화
// collect2DData 함수로 대체됨
// const updateAllWalls = () => {
//   console.log('🔄 updateAllWalls 함수 시작')
//   
//   if (!currentRoom.value) {
//     console.log('❌ currentRoom.value가 없음')
//     return
//   }
// 
//   const bounds = currentRoom.value.bounds
//   if (!bounds) {
//     console.log('❌ bounds가 없음')
//     return
//   }
// 
//   // 캔버스 크기 정보
//   const canvasWidth = fabricCanvas?.width || 800
//   const canvasHeight = fabricCanvas?.height || 600
// 
//   // 외벽 정보
//   const exteriorWalls = [
//     { start: { x: bounds.left, y: bounds.top }, end: { x: bounds.right, y: bounds.top } }, // 위
//     { start: { x: bounds.right, y: bounds.top }, end: { x: bounds.right, y: bounds.bottom } }, // 오른쪽
//     { start: { x: bounds.right, y: bounds.bottom }, end: { x: bounds.left, y: bounds.bottom } }, // 아래
//     { start: { x: bounds.left, y: bounds.bottom }, end: { x: bounds.left, y: bounds.top } } // 왼쪽
//   ]
// 
//   const eventData = {
//     exteriorWalls: exteriorWalls,
//     interiorWalls: interiorWalls.value,
//     roomSize: {
//       width: currentRoom.value.width,
//       height: currentRoom.value.height,
//       centerX: (bounds.left + bounds.right) / 2,
//       centerY: (bounds.top + bounds.bottom) / 2
//     },
//     canvasSize: {
//       width: canvasWidth,
//       height: canvasHeight
//     }
//   }
// 
//   // window.dispatchEvent 제거
// }

// Store를 사용한 캔버스 지우기
// 현재 툴에 따라 모든 벽의 선택 가능 여부를 업데이트
const updateWallSelectability = () => {
  if (!fabricCanvas) return
  
  const isSelectMode = currentTool.value === 'select'

  fabricCanvas.getObjects().forEach((obj: any) => {
    if (obj.userData?.type === 'interior-wall' || obj.userData?.type === 'exterior-wall') {
      obj.selectable = isSelectMode
      obj.evented = isSelectMode
      
      // 시각적 피드백: Draw 모드에서는 약간 투명하게, Select 모드에서는 정상
      if (isSelectMode) {
        obj.opacity = 1.0
        if (obj.userData?.type === 'interior-wall') {
          obj.stroke = '#444444' // 내부벽: 더 진한 색상
        } else {
          obj.stroke = '#666666' // 외부벽: 진한 색상 (Line이므로 stroke 사용)
        }
        obj.hoverCursor = 'move'
        obj.moveCursor = 'move'
      } else {
        obj.opacity = 0.7
        if (obj.userData?.type === 'interior-wall') {
          obj.stroke = '#666666' // 내부벽: 진한 회색
        } else {
          obj.stroke = '#999999' // 외부벽: 진한 회색 (Line이므로 stroke 사용)
        }
        obj.hoverCursor = 'default'
        obj.moveCursor = 'default'
      }
    }
    
    // 배치된 오브젝트 처리 - 항상 선택 가능
    if (obj.userData?.type === 'placed-object') {
      obj.selectable = true
      obj.evented = true
      obj.opacity = 1.0
      obj.hoverCursor = 'move'
      obj.moveCursor = 'move'
    }
    

    
    // 벽 길이 레이블의 투명도도 조정
    if (obj.userData?.type === 'wall-length-label') {
      obj.opacity = isSelectMode ? 1.0 : 0.5
    }
  })
  
  // Draw 모드로 변경될 때 현재 선택 해제
  if (!isSelectMode && selectedObject.value) {
    fabricCanvas.discardActiveObject()
    selectedObject.value = null
  }
  
  fabricCanvas.renderAll()
}

// 벽 길이 표시 레이블 추가
const addWallLengthLabel = (wall: any, start: { x: number, y: number }, end: { x: number, y: number }) => {
  if (!fabricCanvas) return
  
  // 벽 길이 계산 (픽셀을 미터로 변환)
  const lengthPx = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2))
  const lengthM = lengthPx / 40 // 1m = 40px
  const lengthText = lengthM.toFixed(1) + 'm'
  
  // 벽의 중점 계산
  const centerX = (start.x + end.x) / 2
  const centerY = (start.y + end.y) / 2
  
  // 벽의 각도 계산
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  
  // 텍스트 위치 오프셋 (벽에서 조금 떨어뜨림)
  const offsetDistance = 15
  const offsetX = Math.cos(angle + Math.PI/2) * offsetDistance
  const offsetY = Math.sin(angle + Math.PI/2) * offsetDistance
  
  // 텍스트 객체 생성
  const lengthLabel = new fabric.Text(lengthText, {
    left: centerX + offsetX,
    top: centerY + offsetY,
    fontSize: 12,
    fill: '#333333',
    fontFamily: 'Arial',
    textAlign: 'center',
    originX: 'center',
    originY: 'center',
    angle: angle * 180 / Math.PI, // 라디안을 도로 변환
    selectable: false,
    evented: false,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 2
  })
  
  // 벽과 연관된 레이블임을 표시
  lengthLabel.userData = {
    type: 'wall-length-label',
    wallId: wall.userData?.id,
    wallType: wall.userData?.type
  }
  
  fabricCanvas.add(lengthLabel)
}

// 벽 길이 레이블 업데이트
const updateWallLengthLabel = (wall: any) => {
  if (!fabricCanvas) return
  
  const wallId = wall.userData?.id
  if (!wallId) return
  
  // 기존 레이블 찾기 및 제거
  const existingLabel = fabricCanvas.getObjects().find((obj: any) => 
    obj.userData?.type === 'wall-length-label' && obj.userData?.wallId === wallId
  )
  
  if (existingLabel) {
    fabricCanvas.remove(existingLabel)
  }
  
  // 새로운 좌표로 레이블 재생성
  let start, end
  
  if (wall.userData?.type === 'interior-wall' || wall.userData?.type === 'exterior-wall') {
    // 내부벽과 외부벽 모두 Line 객체로 동일하게 처리
    const linePoints = wall.calcLinePoints()
    const matrix = wall.calcTransformMatrix()
    start = fabric.util.transformPoint({ x: linePoints.x1, y: linePoints.y1 }, matrix)
    end = fabric.util.transformPoint({ x: linePoints.x2, y: linePoints.y2 }, matrix)
    
    const wallType = wall.userData?.type === 'interior-wall' ? '내부벽' : '외부벽'
  }
  
  if (start && end) {
    addWallLengthLabel(wall, start, end)
  }
}

// 2D 캔버스에서 오브젝트 색상 업데이트
const updateObjectColorOnCanvas = (placedObjectId: string, newColor: string) => {
  if (!fabricCanvas) return
  
  // 캔버스에서 해당 오브젝트 찾기
  const fabricObject = fabricCanvas.getObjects().find((obj: any) => 
    obj.userData?.type === 'placed-object' && obj.userData?.placedObjectId === placedObjectId
  )
  
  if (fabricObject && fabricObject.type === 'group') {
    // 그룹 내의 사각형 오브젝트 색상 변경
    fabricObject.getObjects().forEach((child: any) => {
      if (child.type === 'rect') {
        child.set('fill', newColor)
      }
    })
    fabricCanvas.renderAll()
  }
}

// Store 기반 2D 오브젝트 재구성 (3D와 동일한 방식)
const rerender2DObjectsFromStore = () => {
  if (!fabricCanvas) return
  
  console.log('🔄 2D Store 기반 재구성 시작')
  
  // 기존 배치 오브젝트 모두 제거
  const objectsToRemove = (fabricCanvas.getObjects() as Array<fabric.Object & { userData?: any }>).filter((obj) => 
    obj.userData?.type === 'placed-object'
  )
  
  console.log(`🗑️ 2D에서 제거할 기존 오브젝트 개수: ${objectsToRemove.length}`)
  
  objectsToRemove.forEach(obj => {
    fabricCanvas.remove(obj)
  })
  
  // Store 데이터 기반으로 모든 오브젝트 재생성
  floorplanStore.placedObjects.forEach(placedObj => {
    const canvasWidth = fabricCanvas.width || 800
    const canvasHeight = fabricCanvas.height || 600
    
    // Store 좌표 → 2D Canvas 좌표 변환
    const fabricX = placedObj.position.x * 40 + canvasWidth / 2
    const fabricY = placedObj.position.y * 40 + canvasHeight / 2
    
    // 오브젝트 모양 생성
    const objectShape = new fabric.Rect({
      left: fabricX - (placedObj.width * 40) / 2,
      top: fabricY - (placedObj.depth * 40) / 2,
      width: placedObj.width * 40,
      height: placedObj.depth * 40,
      fill: placedObj.color || getObjectColor(placedObj.category, placedObj.isOnBox),
      stroke: '#333',
      strokeWidth: 1,
      selectable: true,
      evented: true
    })
    
    // 라벨 생성
    const label = new fabric.Text(placedObj.name, {
      left: fabricX,
      top: fabricY,
      fontSize: 12,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      fill: '#000'
    })
    
    // 그룹으로 묶기
    const group = new fabric.Group([objectShape, label], {
      left: fabricX,
      top: fabricY,
      originX: 'center',
      originY: 'center',
      angle: placedObj.rotation * (180 / Math.PI), // 라디안 → 도
      selectable: true,
      evented: true,
      hasRotatingPoint: true
    })
    
    group.userData = {
      type: 'placed-object',
      placedObjectId: placedObj.id,
      objectName: placedObj.name
    }
    
    fabricCanvas.add(group)
  })
  
  fabricCanvas.renderAll()
  console.log(`✅ 2D Store 기반 재구성 완료 (${floorplanStore.placedObjects.length}개 오브젝트)`)
}

// 상자 위의 장비들을 상자와 함께 이동
const moveObjectsOnBox = (boxObject: any) => {
  if (!boxObject || boxObject.userData?.category !== 'etc' || !boxObject.userData?.isBox) return
  
  const boxId = boxObject.userData?.placedObjectId
  if (!boxId) return
  
  // 상자 위에 있는 모든 장비 찾기
  const objectsOnBox = floorplanStore.placedObjects.filter(obj => obj.boxId === boxId)
  
  objectsOnBox.forEach(obj => {
    // 해당 장비의 Fabric.js 오브젝트 찾기
    const fabricObjects = fabricCanvas?.getObjects() || []
    const fabricObject = fabricObjects.find((fabricObj: any) => 
      fabricObj.userData?.placedObjectId === obj.id
    )
    
    if (fabricObject) {
      // 상자의 새로운 위치에 맞춰 장비 위치 업데이트
      const boxLeft = boxObject.left || 0
      const boxTop = boxObject.top || 0
      
      fabricObject.set({
        left: boxLeft,
        top: boxTop - 20, // 상자 위쪽에 약간 올려서 배치
        angle: boxObject.angle || 0 // 상자와 같은 회전각 적용
      })
      
      // Store도 업데이트
      const canvasWidth = fabricCanvas?.width || 800
      const canvasHeight = fabricCanvas?.height || 600
      const worldX = (boxLeft - canvasWidth / 2) / 40
      const worldY = (boxTop - canvasHeight / 2) / 40
      
      const updatedObject = {
        ...obj,
        position: { x: worldX, y: worldY },
        rotation: (boxObject.angle || 0) * (Math.PI / 180) // 상자와 같은 회전각 (라디안)
      }
      floorplanStore.updatePlacedObject(obj.id, updatedObject)
    }
  })
  
  fabricCanvas?.renderAll()
  console.log(`📦 상자 이동으로 인한 장비 ${objectsOnBox.length}개 이동 완료`)
}

// Store에서 배치된 오브젝트 정보 업데이트
const updatePlacedObjectInStore = (fabricObject: any) => {
  if (!fabricObject || !fabricObject.userData?.placedObjectId) return
  
  const placedObjectId = fabricObject.userData.placedObjectId
  const canvasWidth = fabricCanvas?.width || 800
  const canvasHeight = fabricCanvas?.height || 600

  // Fabric.js 좌표를 3D 월드 좌표로 변환 (벽과 동일한 방식)
  const worldX = (fabricObject.left - canvasWidth / 2) / 40   // X축 좌표
  const worldY = (fabricObject.top - canvasHeight / 2) / 40   // Y축 좌표 (벽과 동일한 방식)
  
  // 회전값 변환 (Fabric.js는 도 단위, Store는 라디안 단위)
  const fabricAngle = fabricObject.angle || 0
  const rotationRadians = fabricAngle * (Math.PI / 180)
  
  console.log(`🔄 2D 회전 업데이트: ${fabricAngle}도 → ${rotationRadians.toFixed(3)} 라디안`)
  console.log(`🔄 시계방향이 양수인지 확인 중...`)
  
  console.log(`오브젝트 이동: Fabric(${fabricObject.left}, ${fabricObject.top}) → World(${worldX}, ${worldY})`)
  
  // Store에서 해당 오브젝트 찾기
  const existingObject = floorplanStore.placedObjects.find(obj => obj.id === placedObjectId)
  if (existingObject) {
    const updatedObject = {
      ...existingObject,
      position: { x: worldX, y: worldY },
      rotation: rotationRadians
    }
    floorplanStore.updatePlacedObject(placedObjectId, updatedObject)
  }
}

// Object Library에서 오브젝트 배치 처리
const handlePlaceObject = (event: any) => {
  if (!fabricCanvas) return
  
  const { object } = event.detail
  
  let centerX: number
  let centerY: number
  
  // 상자 위 배치 모드인 경우 상자 위에 배치
  if (boxPlacementMode.value && selectedBox.value && object.category !== 'etc') {
    const box = selectedBox.value
    const boxLeft = box.left || 0
    const boxTop = box.top || 0
    
    // 상자 위 중앙에 배치
    centerX = boxLeft
    centerY = boxTop - 20 // 상자 위쪽에 약간 올려서 배치
    
    console.log('📦 상자 위에 장비 배치:', object.name, '위치:', centerX, centerY)
  } else {
    // 일반 배치 - 캔버스 중앙에 배치
    const canvasWidth = fabricCanvas.width || 800
    const canvasHeight = fabricCanvas.height || 600
    centerX = canvasWidth / 2
    centerY = canvasHeight / 2
  }
  
  // 오브젝트 크기 (미터 단위를 픽셀로 변환) - 2D에서는 width(가로), depth(세로) 사용
  const meterToPixel = 40 // 1m = 40px
  let objectWidth = (object.width || 1) * meterToPixel   // 가로
  let objectHeight = (object.depth || 1) * meterToPixel  // 세로 (2D 표현용)
  
  // 상자 위 배치인 경우 크기를 약간 작게 조정
  if (boxPlacementMode.value && selectedBox.value && object.category !== 'etc') {
    objectWidth *= 0.8
    objectHeight *= 0.8
  }
  
  // 카테고리별 색상 및 모양 설정
  let objectShape: any
  // GLB에서 추출한 색상이 있으면 사용, 없으면 카테고리 기본 색상 사용
  const isBox = object.isBox || false
  const objectColor = object.color || getObjectColor(object.category, isBox)
  const objectIcon = getObjectIcon(object.category, isBox)
  
  // 사각형으로 오브젝트 표현 (추후 이미지나 복잡한 도형으로 확장 가능)
  objectShape = new fabric.Rect({
    left: 0, // 그룹 내에서의 상대 위치
    top: 0,  // 그룹 내에서의 상대 위치
    width: objectWidth,
    height: objectHeight,
    fill: objectColor,
    stroke: '#333',
    strokeWidth: 2,
    angle: 0,
    originX: 'center',
    originY: 'center',
    shadow: boxPlacementMode.value && selectedBox.value && object.category !== 'etc' 
      ? new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 4, offsetX: 2, offsetY: 2 })
      : null
  })
  
  // 오브젝트 이름 레이블 추가
  const nameLabel = new fabric.Text(`${objectIcon} ${object.name}`, {
    left: 0, // 그룹 내에서의 상대 위치
    top: objectHeight / 2 + 10, // 오브젝트 아래쪽에 배치
    fontSize: boxPlacementMode.value && selectedBox.value && object.category !== 'etc' ? 8 : 10,
    fill: '#333',
    fontFamily: 'Arial',
    textAlign: 'center',
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 2
  })
  
  // 고유 ID 생성 (배치된 오브젝트용)
  const placedObjectId = `placed-${object.id}-${Date.now()}`
  
  // 오브젝트와 레이블을 그룹으로 묶기
  const objectGroup = new fabric.Group([objectShape, nameLabel], {
    left: centerX,
    top: centerY,
    originX: 'center',
    originY: 'center',
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    lockScalingX: true,
    lockScalingY: true,
    lockUniScaling: true,
    hasRotatingPoint: true,
          userData: {
        type: 'placed-object',
        placedObjectId: placedObjectId,
        objectId: object.id,
        objectName: object.name,
        category: object.category,
        glbUrl: object.glbUrl,
        description: object.description,
        width: object.width,
        height: object.height,
        isOnBox: boxPlacementMode.value && selectedBox.value && object.category !== 'etc',
        boxId: boxPlacementMode.value && selectedBox.value ? selectedBox.value.userData?.placedObjectId : null,
        depth: object.depth // 3D에서 사용할 깊이 정보 추가
      }
  })
  
  // 크기 조정 핸들만 숨기고 회전 핸들은 유지
  objectGroup.setControlsVisibility({
    tl: false, // top-left
    tr: false, // top-right
    br: false, // bottom-right
    bl: false, // bottom-left
    ml: false, // middle-left
    mt: false, // middle-top
    mr: false, // middle-right
    mb: false, // middle-bottom
    mtr: true  // rotation handle (middle-top-rotate)
  })
  
  fabricCanvas.add(objectGroup)
  fabricCanvas.renderAll()
  
  // Store에 배치된 오브젝트 정보 추가 (벽과 동일한 좌표계 사용)
  const placedObjectData = {
    id: placedObjectId,
    name: object.name,
    category: object.category,
    glbUrl: object.glbUrl,
    lodUrl: object.lodUrl, // LOD 모델 URL 추가
    description: object.description,
    width: object.width || 1,    // 가로 (2D X축)
    depth: object.depth || 1,    // 세로 (2D Y축)
    height: object.height || 2,  // 높이 (3D에서만 사용)
    position: {
      x: (centerX - (fabricCanvas.width || 800) / 2) / 40,  // 벽과 동일한 좌표 변환
      y: (centerY - (fabricCanvas.height || 600) / 2) / 40  // 벽과 동일한 좌표 변환
    },
    rotation: 0, // 초기 회전값
    color: object.color, // GLB에서 추출한 색상 (있다면)
    isOnBox: boxPlacementMode.value && selectedBox.value && object.category !== 'etc', // 상자 위 배치 여부
    boxId: boxPlacementMode.value && selectedBox.value ? selectedBox.value.userData?.placedObjectId : null, // 상자 ID
    isBox: object.isBox || false, // 상자 여부
    instancing: object.instancing || false // 인스턴싱 값 추가
  }
  
  console.log('📦 Store에 오브젝트 추가 중:', placedObjectData)
  floorplanStore.addPlacedObject(placedObjectData)
  
  console.log('📦 Store 현재 상태 - placedObjects 개수:', floorplanStore.placedObjects.length)
  console.log('📦 Store 현재 상태 - placedObjects:', floorplanStore.placedObjects)
  
  // 🚀 핵심 개선: Store 기반 2D 재구성 (일관성 있는 렌더링)
  console.log('🔄 Store 변경으로 인한 2D 재구성 시작')
  rerender2DObjectsFromStore()
  console.log('✅ Store 기반 2D 재구성 완료')
  
  // 상자 위 배치 후 상자 모드 비활성화
  if (boxPlacementMode.value) {
    boxPlacementMode.value = false
    selectedBox.value = null
    console.log('📦 상자 위 배치 완료 - 상자 모드 비활성화')
  }
  
  // 배치 완료 (알림 제거)
}

// 카테고리별 색상 반환
const getObjectColor = (category: string, isBox?: boolean): string => {
  const colorMap: { [key: string]: string } = {
    robot: '#FF6B6B',     // 빨간색 계열
    equipment: '#4ECDC4',  // 청록색 계열
    appliances: '#45B7D1', // 파란색 계열
    etc: isBox ? '#D2B48C' : '#96CEB4'  // 상자는 파스텔 브라운, 일반 ETC는 녹색
  }
  return colorMap[category] || '#CCCCCC'
}

// 카테고리별 아이콘 반환
const getObjectIcon = (category: string, isBox?: boolean): string => {
  const iconMap: { [key: string]: string } = {
    robot: '🤖',
    equipment: '⚙️',
    appliances: '🔌',
    etc: isBox ? '📦' : '📂'  // 상자는 📦, 일반 ETC는 📂
  }
  return iconMap[category] || '📦'
}

const clearCanvas = () => {
  if (!fabricCanvas) return
  
  fabricCanvas.clear()
  
  // 확대/축소 및 이동 상태 리셋
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
  isPanning.value = false
  
  addGrid()
  selectedObject.value = null
  
  // Store 초기화
  floorplanStore.clearRoom()
  floorplanStore.clearPlacedObjects()
  
  // 캔버스 크기 정보 업데이트
  const canvasWidth = fabricCanvas.width || 800
  const canvasHeight = fabricCanvas.height || 600
  floorplanStore.setCanvasSize({ width: canvasWidth, height: canvasHeight })
}

// 평면도 내보내기
const exportFloorPlan = () => {
  if (!fabricCanvas) return
  
  const dataURL = fabricCanvas.toDataURL({
    format: 'png',
    quality: 1,
  })
  
  // 다운로드 링크 생성
  const link = document.createElement('a')
  link.download = `room_${roomWidth.value}x${roomHeight.value}m.png`
  link.href = dataURL
  link.click()
}

// 선택된 오브젝트 삭제
const deleteSelectedObject = () => {
  console.log('🗑️ 삭제 시도:', selectedObject.value)
  
  if (!selectedObject.value || !fabricCanvas) {
    console.log('❌ 삭제 실패: selectedObject 없음 또는 canvas 없음')
    alert('삭제할 오브젝트를 먼저 선택해주세요.')
    return
  }

  const objectToDelete = selectedObject.value
  const objectId = objectToDelete.userData?.id
  const objectType = objectToDelete.userData?.type
  
  console.log(`🗑️ 삭제 대상: ${objectType}, ID: ${objectId}`)
  
    if (objectType === 'placed-object') {
    // 배치된 오브젝트 삭제 (그룹으로 묶여있으므로 레이블도 함께 삭제됨)
    const placedObjectId = objectToDelete.userData?.placedObjectId
    console.log(`📦 배치된 오브젝트 삭제: ${placedObjectId}`)
    
    console.log('🎯 Fabric.js 제거 전 canvas 객체 수:', fabricCanvas.getObjects().length)
    console.log('🎯 제거할 객체:', objectToDelete)
    console.log('🎯 제거할 객체 타입:', objectToDelete.type)
    
    fabricCanvas.remove(objectToDelete)
    
    console.log('🎯 Fabric.js 제거 후 canvas 객체 수:', fabricCanvas.getObjects().length)
    
    // 강제 렌더링
    fabricCanvas.renderAll()
    fabricCanvas.requestRenderAll()
    
    console.log('🎯 Fabric.js 강제 렌더링 완료')
    
    // Store에서도 제거
    if (placedObjectId) {
      console.log(`🗑️ Store 제거 전 개수: ${floorplanStore.placedObjects.length}`)
      console.log(`🗑️ Store 제거 전 오브젝트들:`, floorplanStore.placedObjects.map(obj => obj.id))
      
      // 상자가 삭제되는 경우 그 위의 장비들도 함께 삭제
      if (objectToDelete.userData?.category === 'etc' && objectToDelete.userData?.isBox) {
        const objectsOnBox = floorplanStore.placedObjects.filter(obj => obj.boxId === placedObjectId)
        console.log(`📦 상자 위의 장비 ${objectsOnBox.length}개도 함께 삭제`)
        
        objectsOnBox.forEach(obj => {
          // Fabric.js에서도 제거
          const fabricObjects = fabricCanvas.getObjects()
          const fabricObject = fabricObjects.find((fabricObj: any) => 
            fabricObj.userData?.placedObjectId === obj.id
          )
          if (fabricObject) {
            fabricCanvas.remove(fabricObject)
          }
          
          // Store에서 제거
          floorplanStore.removePlacedObject(obj.id)
        })
      }
      
      floorplanStore.removePlacedObject(placedObjectId)
      
      console.log(`🗑️ Store 제거 후 개수: ${floorplanStore.placedObjects.length}`)
      console.log(`🗑️ Store 제거 후 오브젝트들:`, floorplanStore.placedObjects.map(obj => obj.id))
      console.log(`✅ Store에서 오브젝트 제거 완료: ${placedObjectId}`)
      
      // 🚀 핵심 개선: Store 기반 2D 재구성 (3D와 동일한 방식)
      console.log('🔄 Store 변경으로 인한 2D 재구성 시작')
      rerender2DObjectsFromStore()
      console.log('✅ Store 기반 2D 재구성 완료')
      
    } else {
      console.log('⚠️ placedObjectId 없음')
    }
    
    // 선택 해제
    selectedObject.value = null
    fabricCanvas.discardActiveObject()
    console.log('✅ 배치된 오브젝트 삭제 완료')
    
  } else if (objectType === 'interior-wall' || objectType === 'exterior-wall') {
    // 벽 삭제 (기존 로직)
    const associatedLabel = fabricCanvas.getObjects().find((obj: any) => 
      obj.userData?.type === 'wall-length-label' && obj.userData?.wallId === objectId
    )
    
    if (associatedLabel) {
      fabricCanvas.remove(associatedLabel)
    }

    fabricCanvas.remove(objectToDelete)

    const allObjects = fabricCanvas.getObjects()
    const wallsToRemove = allObjects.filter((obj: any) => 
      obj.userData?.id === objectId && (obj.userData?.type === 'interior-wall' || obj.userData?.type === 'exterior-wall')
    )
    
    wallsToRemove.forEach((wall: any) => {
    fabricCanvas.remove(wall)
    })

    // Store에서 벽 제거
    if (objectType === 'interior-wall') {
      if (objectId) {
        floorplanStore.removeInteriorWall(objectId)
      }
    } else if (objectType === 'exterior-wall') {
      if (objectId) {
        floorplanStore.removeExteriorWall(objectId)
      }
    }
  } else if (objectType === 'room-floor') {
    // 바닥 삭제: 같은 floorId의 라벨/사각형 모두 제거, 스토어 업데이트, 강제 리프레시 및 레이어 재정렬
    const floorId = objectToDelete.userData?.floorId
    if (floorId) {
      // 라벨 제거
      const sizeLabels = fabricCanvas.getObjects().filter((obj: any) => obj.userData?.type === 'room-size-label' && obj.userData?.floorId === floorId)
      sizeLabels.forEach((lbl: any) => fabricCanvas.remove(lbl))
      // 사각형(바닥) 중 동일 floorId가 남아있다면 모두 제거
      const sameFloorRects = fabricCanvas.getObjects().filter((obj: any) => obj.userData?.type === 'room-floor' && obj.userData?.floorId === floorId)
      sameFloorRects.forEach((rect: any) => fabricCanvas.remove(rect))
      // Store에서 제거
      floorplanStore.removeFloor(floorId)
    } else {
      // floorId가 없는 경우도 안전하게 제거
      fabricCanvas.remove(objectToDelete)
    }
    // 레이어 재정렬 및 강제 리렌더
    sendAllFloorsToBack()
    positionGridAfterFloors()
    fabricCanvas.discardActiveObject()
    selectedObject.value = null
    fabricCanvas.requestRenderAll()
    fabricCanvas.renderAll()
  }

  // 선택 해제
  selectedObject.value = null
  fabricCanvas.discardActiveObject()
  
  // 5. 강제 캔버스 재렌더링 (여러 방법 시도)
  try {
    fabricCanvas.renderAll()
    fabricCanvas.requestRenderAll()
  } catch (error) {
    console.error('❌ 캔버스 재렌더링 실패:', error)
  }
  
  // 6. 3D 업데이트 제거 - Make3D 버튼으로만 변환
  // updateAllWalls() 제거
  
}

// 뷰 리셋 (확대/축소 및 이동 초기화)
const resetView = () => {
  if (!fabricCanvas) return
  
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
  isPanning.value = false
  
  updateCanvasTransform()
}

// 윈도우 리사이즈 핸들링
const handleResize = () => {
  if (!fabricCanvas || !canvasWrapper.value) return

  const wrapper = canvasWrapper.value
  const width = wrapper.clientWidth
  const height = wrapper.clientHeight

  fabricCanvas.setDimensions({ width, height })
  
  // Store에 캔버스 크기 업데이트
  floorplanStore.setCanvasSize({ width, height })
  
  // 확대/축소 상태 유지하면서 그리드 업데이트
  updateCanvasTransform()
}

// Store 사용으로 데이터 요청 처리 함수들 제거
// 이제 3D에서 직접 store에 접근하므로 이벤트 기반 요청-응답 불필요
// const handleMake3DDataRequest = ... (제거됨)
// const collect2DData = ... (제거됨)

// 툴 변경 감지 및 벽 선택 가능 여부 업데이트
watch(currentTool, (newTool, oldTool) => {
  updateWallSelectability()
  
  // 커서 스타일 업데이트
  if (canvasWrapper.value) {
    if (newTool === 'wall') {
      canvasWrapper.value.classList.add('drawing-mode')
    } else {
      canvasWrapper.value.classList.remove('drawing-mode')
    }
  }
})

// Store의 배치된 오브젝트 색상 변경 감지
watch(
  () => floorplanStore.placedObjects,
  (newObjects, oldObjects) => {
    if (!fabricCanvas || !newObjects) return
    
    // 색상이 변경된 오브젝트들을 찾아서 2D 캔버스 업데이트
    newObjects.forEach(newObj => {
      const oldObj = oldObjects?.find(old => old.id === newObj.id)
      
      // 색상이 새로 추가되거나 변경된 경우
      if (newObj.color && (!oldObj || oldObj.color !== newObj.color)) {
        updateObjectColorOnCanvas(newObj.id, newObj.color)
      }
    })
  },
  { deep: true }
)

onMounted(() => {
  initCanvas()
  window.addEventListener('resize', handleResize)
  window.addEventListener('placeObject', handlePlaceObject)
})

onUnmounted(() => {
  if (fabricCanvas) {
    // 모든 키보드 이벤트 제거
    fabricCanvas.upperCanvasEl.removeEventListener('keydown', handleCanvasKeydown)
    fabricCanvas.upperCanvasEl.removeEventListener('click', focusCanvas)
    fabricCanvas.upperCanvasEl.removeEventListener('mousedown', focusCanvas)
    
    // Fabric.js 이벤트 리스너들 제거
    fabricCanvas.off('selection:created')
    fabricCanvas.off('selection:updated')
    fabricCanvas.off('selection:cleared')
    fabricCanvas.off('object:modified')
    fabricCanvas.off('object:moving')
    fabricCanvas.off('object:scaling')
    fabricCanvas.off('object:rotating')
    fabricCanvas.off('mouse:down')
    fabricCanvas.off('mouse:move')
    fabricCanvas.off('mouse:up')
    
    fabricCanvas.dispose()
  }
  
  if (canvasWrapper.value) {
    canvasWrapper.value.removeEventListener('keydown', handleCanvasKeydown)
    canvasWrapper.value.removeEventListener('click', focusCanvas)
  }
  
  document.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('placeObject', handlePlaceObject)
})
</script>

<style scoped>
.editor-2d-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8f9fa;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: white;
  border-bottom: 1px solid #ddd;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  gap: 2rem;
}

.color-swatches {
  display: flex;
  gap: 8px;
  align-items: center;
}

.swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid #ccc;
  cursor: pointer;
}

.swatch.selected {
  outline: 2px solid #333;
}

.room-controls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.room-controls h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.size-inputs {
  display: flex;
  gap: 1rem;
  align-items: end;
}

.wall-tools {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.wall-tools h4 {
  margin: 0;
  font-size: 1rem;
  color: #2c3e50;
}

.tool-buttons {
  display: flex;
  gap: 0.5rem;
}

.selection-info {
  margin-top: 0.5rem;
  padding: 0.25rem 0.75rem;
  background-color: #e8f5e8;
  border: 1px solid #c3e6c3;
  border-radius: 4px;
  font-size: 0.8rem;
  color: #2d5a2d;
}



.tool-info {
  margin-top: 0.5rem;
  padding: 0.25rem 0.75rem;
  background-color: #e8f4fd;
  border: 1px solid #b3d9f7;
  border-radius: 4px;
  font-size: 0.8rem;
  color: #1e4a72;
}

.debug-info {
  margin-top: 0.5rem;
  padding: 0.25rem 0.75rem;
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #856404;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.input-group label {
  font-size: 0.85rem;
  color: #666;
  font-weight: 500;
}

.input-group input {
  width: 80px;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
  text-align: center;
}

.input-group input:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

.tool-group {
  display: flex;
  gap: 0.5rem;
}

.btn.active {
  background: #3498db !important;
  color: white;
}

.btn-danger {
  background: #e74c3c;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #c0392b;
}

.btn-danger:disabled {
  background: #bdc3c7;
  color: #7f8c8d;
}

.canvas-wrapper {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.canvas-wrapper canvas {
  display: block;
  cursor: crosshair;
}

/* 확대/축소 및 이동 관련 스타일 */
.canvas-wrapper {
  cursor: grab;
}

.canvas-wrapper:active {
  cursor: grabbing;
}

/* 벽 그리기 모드일 때 커서 변경 */
.canvas-wrapper.drawing-mode {
  cursor: crosshair;
}

.statusbar {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: white;
  border-top: 1px solid #ddd;
  font-size: 0.85rem;
  color: #666;
  flex-wrap: wrap;
  gap: 1rem;
}

.statusbar span {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* 버튼 비활성화 스타일 */
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:disabled:hover {
  background: #95a5a6;
}

/* 유효하지 않은 입력 스타일 */
.input-group input:invalid {
  border-color: #e74c3c;
}

/* 상자 모드 표시 스타일 */
.box-mode-indicator {
  background: #D2B48C;
  color: #8B4513;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-weight: bold;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  100% { opacity: 1; }
}
</style> 