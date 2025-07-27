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
              max="20" 
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
              max="20" 
              step="0.5"
              placeholder="세로"
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
            @click="deleteSelectedWall" 
            :disabled="!selectedWall"
            class="btn btn-danger"
            title="Delete Selected Wall"
          >
            🗑️ Delete
          </button>
        </div>
        <div v-if="selectedWall" class="selection-info">
          <small>
            ✅ {{ selectedWall.userData?.type === 'exterior-wall' ? 'Exterior Wall' : 'Interior Wall' }} selected 
            ({{ selectedWall.userData?.position || 'custom' }}) - Press Delete or click button to remove
          </small>
        </div>
        

        
        <div class="tool-info">
          <small v-if="currentTool === 'select'">
            🛠️ <strong>Select Mode:</strong> Click interior/exterior walls to select and move them. Use Delete to remove selected walls.
          </small>
          <small v-else-if="currentTool === 'wall'">
            🛠️ <strong>Draw Mode (Active):</strong> Click and drag on canvas to draw new walls. Existing walls are not selectable.
          </small>
        </div>
        
        <!-- 디버깅용 정보 -->
        <div v-if="currentTool === 'wall'" class="debug-info">
          <small>🐛 Debug: Tool = "{{ currentTool }}", Canvas = {{ !!fabricCanvas ? 'Ready' : 'Not Ready' }}</small>
        </div>
      </div>
      
      <div class="tool-group">
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
      <span v-if="floorplanStore.hasRoom">✅ Created: {{ floorplanStore.currentRoom?.width }}m × {{ floorplanStore.currentRoom?.height }}m</span>
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
const currentTool = ref('select')
const mousePosition = ref({ x: 0, y: 0 })
const selectedWall = ref<any>(null)


// Store에서 직접 사용할 데이터들 (로컬 state 제거)
// const currentRoom = ref<{width: number, height: number, bounds?: any} | null>(null) -> store 사용
// const interiorWalls = ref<any[]>([]) -> store 사용

// 크기 유효성 검사
const isValidSize = computed(() => {
  return roomWidth.value > 0 && roomHeight.value > 0 && 
         roomWidth.value <= 20 && roomHeight.value <= 20
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

  // 이벤트 리스너
  fabricCanvas.on('mouse:move', (e: any) => {
    const pointer = fabricCanvas!.getPointer(e.e)
    mousePosition.value = { 
      x: Math.round(pointer.x), 
      y: Math.round(pointer.y) 
    }
  })

  // 벽 그리기 이벤트 설정
  setupWallDrawing()

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
    deleteSelectedWall()
  }
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
    
    if (currentTool.value !== 'select') {
      fabricCanvas.discardActiveObject()
      selectedWall.value = null
      return
    }
    
    if (selected && (selected.userData?.type === 'interior-wall' || selected.userData?.type === 'exterior-wall')) {
      selectedWall.value = selected
    } else {
      selectedWall.value = null
    }
  })

  fabricCanvas.on('selection:updated', (e: any) => {
    const selected = e.selected[0]
    
    if (currentTool.value !== 'select') {
      fabricCanvas.discardActiveObject()
      selectedWall.value = null
      return
    }
    
    if (selected && (selected.userData?.type === 'interior-wall' || selected.userData?.type === 'exterior-wall')) {
      selectedWall.value = selected
      const wallType = selected.userData?.type === 'interior-wall' ? 'Interior Wall' : 'Exterior Wall'
    } else {
      selectedWall.value = null
    }
  })

  fabricCanvas.on('selection:cleared', () => {
    selectedWall.value = null
  })

  updateWallSelectability()

  fabricCanvas.on('object:modified', (e: any) => {
    const modifiedObject = e.target
    if (modifiedObject && (modifiedObject.userData?.type === 'interior-wall' || modifiedObject.userData?.type === 'exterior-wall')) {
      const wallType = modifiedObject.userData?.type === 'interior-wall' ? '내부 벽' : '외부 벽'
      updateInteriorWallInList(modifiedObject)
    }
  })

  fabricCanvas.on('object:moving', (e: any) => {
    const movingObject = e.target
    if (movingObject && (movingObject.userData?.type === 'interior-wall' || movingObject.userData?.type === 'exterior-wall')) {
      const wallType = movingObject.userData?.type === 'interior-wall' ? '내부 벽' : '외부 벽'
      updateInteriorWallInList(movingObject)
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
      stroke: '#999999',
      strokeWidth: 3,
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
      stroke: '#f0f0f0',
      strokeWidth: 1,
      selectable: false,
      evented: false,
    }))
  }

  // 가로선 (50cm 간격)
  for (let i = 0; i <= height; i += gridSize) {
    lines.push(new fabric.Line([0, i, width, i], {
      stroke: '#f0f0f0',
      strokeWidth: 1,
      selectable: false,
      evented: false,
    }))
  }

  // 굵은 그리드 (2.5m 간격)
  for (let i = 0; i <= width; i += gridSize * 5) {
    lines.push(new fabric.Line([i, 0, i, height], {
      stroke: '#d0d0d0',
      strokeWidth: 2,
      selectable: false,
      evented: false,
    }))
  }

  for (let i = 0; i <= height; i += gridSize * 5) {
    lines.push(new fabric.Line([0, i, width, i], {
      stroke: '#d0d0d0',
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
  fabricCanvas.sendToBack(grid)
}

// Store를 사용한 내부 벽 추가
const addInteriorWall = (start: { x: number, y: number }, end: { x: number, y: number }) => {
  if (!fabricCanvas) return

  // 현재 툴에 따라 선택 가능 여부 및 시각적 스타일 결정
  const isSelectMode = currentTool.value === 'select'

  const wall = new fabric.Line([start.x, start.y, end.x, end.y], {
    stroke: isSelectMode ? '#666666' : '#999999', // Select 모드: 진한 회색, Draw 모드: 밝은 회색
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



// Store를 사용한 네모난 방 생성
const createRoom = () => {
  if (!fabricCanvas || !isValidSize.value) return

  // 기존 방 제거
  clearCanvas()

  const scale = 40 // 1m = 40px (0.5m = 20px)
  const wallThickness = 2 // 벽 두께 (픽셀) - 사용자 요청으로 8 → 2로 수정
  
  const roomWidthPx = roomWidth.value * scale
  const roomHeightPx = roomHeight.value * scale
  
  // 캔버스 중앙에 배치
  const canvasWidth = fabricCanvas.width!
  const canvasHeight = fabricCanvas.height!
  const startX = (canvasWidth - roomWidthPx) / 2
  const startY = (canvasHeight - roomHeightPx) / 2

  // 벽 생성 (4개의 선) - 내부벽과 동일한 방식
  const walls = []

  // 위쪽 벽 (좌 → 우)
  const topWall = new fabric.Line([startX, startY, startX + roomWidthPx, startY], {
    stroke: '#999999', // 더 밝은 회색
    strokeWidth: wallThickness,
    selectable: true,
    evented: true,
    opacity: 1,
    hoverCursor: 'move',
    moveCursor: 'move'
  })
  topWall.userData = { 
    type: 'exterior-wall',
    id: 'exterior-top-' + Date.now(),
    position: 'top'
  }
  walls.push(topWall)

  // 아래쪽 벽 (좌 → 우)
  const bottomWall = new fabric.Line([startX, startY + roomHeightPx, startX + roomWidthPx, startY + roomHeightPx], {
    stroke: '#999999', // 더 밝은 회색
    strokeWidth: wallThickness,
    selectable: true,
    evented: true,
    opacity: 1,
    hoverCursor: 'move',
    moveCursor: 'move'
  })
  bottomWall.userData = { 
    type: 'exterior-wall',
    id: 'exterior-bottom-' + Date.now(),
    position: 'bottom'
  }
  walls.push(bottomWall)

  // 왼쪽 벽 (위 → 아래)
  const leftWall = new fabric.Line([startX, startY, startX, startY + roomHeightPx], {
    stroke: '#999999', // 더 밝은 회색
    strokeWidth: wallThickness,
    selectable: true,
    evented: true,
    opacity: 1,
    hoverCursor: 'move',
    moveCursor: 'move'
  })
  leftWall.userData = { 
    type: 'exterior-wall',
    id: 'exterior-left-' + Date.now(),
    position: 'left'
  }
  walls.push(leftWall)

  // 오른쪽 벽 (위 → 아래)
  const rightWall = new fabric.Line([startX + roomWidthPx, startY, startX + roomWidthPx, startY + roomHeightPx], {
    stroke: '#999999', // 더 밝은 회색
    strokeWidth: wallThickness,
    selectable: true,
    evented: true,
    opacity: 1,
    hoverCursor: 'move',
    moveCursor: 'move'
  })
  rightWall.userData = { 
    type: 'exterior-wall',
    id: 'exterior-right-' + Date.now(),
    position: 'right'
  }
  walls.push(rightWall)

  // 캔버스에 추가 (바닥 제거됨)
  walls.forEach((wall: any) => fabricCanvas.add(wall))

  // Store에 룸 정보 업데이트
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
  
  // Store에 외부벽들도 추가
  floorplanStore.clearExteriorWalls() // 기존 외부벽 제거
  
  // 외부벽 데이터를 Line 형태로 변환하여 Store에 저장 (실제 Line 좌표 사용)
  const exteriorWallData = [
    { // 위쪽 벽
      start: { x: startX, y: startY },
      end: { x: startX + roomWidthPx, y: startY },
      id: topWall.userData.id
    },
    { // 아래쪽 벽  
      start: { x: startX, y: startY + roomHeightPx },
      end: { x: startX + roomWidthPx, y: startY + roomHeightPx },
      id: bottomWall.userData.id
    },
    { // 왼쪽 벽
      start: { x: startX, y: startY },
      end: { x: startX, y: startY + roomHeightPx },
      id: leftWall.userData.id
    },
    { // 오른쪽 벽
      start: { x: startX + roomWidthPx, y: startY },
      end: { x: startX + roomWidthPx, y: startY + roomHeightPx },
      id: rightWall.userData.id
    }
  ]
  
  exteriorWallData.forEach(wallData => {
    floorplanStore.addExteriorWall(wallData)
  })
  
  fabricCanvas.renderAll()
  
  // 외부벽에도 길이 표시 추가 (Line 좌표 사용)
  setTimeout(() => {
    addWallLengthLabel(topWall, { x: startX, y: startY }, { x: startX + roomWidthPx, y: startY })
    addWallLengthLabel(bottomWall, { x: startX, y: startY + roomHeightPx }, { x: startX + roomWidthPx, y: startY + roomHeightPx })
    addWallLengthLabel(leftWall, { x: startX, y: startY }, { x: startX, y: startY + roomHeightPx })
    addWallLengthLabel(rightWall, { x: startX + roomWidthPx, y: startY }, { x: startX + roomWidthPx, y: startY + roomHeightPx })
    fabricCanvas.renderAll()
    
    floorplanStore.logCurrentState()
  }, 100)
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
          obj.stroke = '#666666' // 내부벽: 정상 색상
        } else {
          obj.stroke = '#999999' // 외부벽: 정상 색상 (Line이므로 stroke 사용)
        }
        obj.hoverCursor = 'move'
        obj.moveCursor = 'move'
      } else {
        obj.opacity = 0.7
        if (obj.userData?.type === 'interior-wall') {
          obj.stroke = '#999999' // 내부벽: 더 밝은 회색
        } else {
          obj.stroke = '#cccccc' // 외부벽: 더 밝은 회색 (Line이므로 stroke 사용)
        }
        obj.hoverCursor = 'default'
        obj.moveCursor = 'default'
      }
      
      const wallType = obj.userData?.type === 'interior-wall' ? '내부벽' : '외부벽'
    }
    

    
    // 벽 길이 레이블의 투명도도 조정
    if (obj.userData?.type === 'wall-length-label') {
      obj.opacity = isSelectMode ? 1.0 : 0.5
    }
  })
  
  // Draw 모드로 변경될 때 현재 선택 해제
  if (!isSelectMode && selectedWall.value) {
    fabricCanvas.discardActiveObject()
    selectedWall.value = null
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

const clearCanvas = () => {
  if (!fabricCanvas) return
  
  fabricCanvas.clear()
  addGrid()
  selectedWall.value = null
  
  // Store 초기화
  floorplanStore.clearRoom()
  
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

// 선택된 벽 삭제
const deleteSelectedWall = () => {
  if (!selectedWall.value || !fabricCanvas) {
    return
  }

  const wallToDelete = selectedWall.value
  const wallId = wallToDelete.userData?.id
  const wallType = wallToDelete.userData?.type

  // 벽 정보 수집
  const associatedLabel = fabricCanvas.getObjects().find((obj: any) => 
    obj.userData?.type === 'wall-length-label' && obj.userData?.wallId === wallId
  )
  
  if (associatedLabel) {
    fabricCanvas.remove(associatedLabel)
  }

  fabricCanvas.remove(wallToDelete)

  const allObjects = fabricCanvas.getObjects()
  const wallsToRemove = allObjects.filter((obj: any) => 
    obj.userData?.id === wallId && (obj.userData?.type === 'interior-wall' || obj.userData?.type === 'exterior-wall')
  )
  
  wallsToRemove.forEach((wall: any) => {
    fabricCanvas.remove(wall)
  })

  // 4. Store에서 벽 제거 (타입별 처리)
  
  if (wallType === 'interior-wall') {
    if (wallId) {
      floorplanStore.removeInteriorWall(wallId)
    }
  } else if (wallType === 'exterior-wall') {
    if (wallId) {
      floorplanStore.removeExteriorWall(wallId)
    }
  }

  // 5. 선택 해제
  selectedWall.value = null
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

// 윈도우 리사이즈 핸들링
const handleResize = () => {
  if (!fabricCanvas || !canvasWrapper.value) return

  const wrapper = canvasWrapper.value
  const width = wrapper.clientWidth
  const height = wrapper.clientHeight

  fabricCanvas.setDimensions({ width, height })
  
  // Store에 캔버스 크기 업데이트
  floorplanStore.setCanvasSize({ width, height })
  
  // 그리드 다시 그리기
  clearCanvas()
}

// Store 사용으로 데이터 요청 처리 함수들 제거
// 이제 3D에서 직접 store에 접근하므로 이벤트 기반 요청-응답 불필요
// const handleMake3DDataRequest = ... (제거됨)
// const collect2DData = ... (제거됨)

// 툴 변경 감지 및 벽 선택 가능 여부 업데이트
watch(currentTool, (newTool, oldTool) => {
  updateWallSelectability()
})

onMounted(() => {
  initCanvas()
  window.addEventListener('resize', handleResize)
  
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
</style> 