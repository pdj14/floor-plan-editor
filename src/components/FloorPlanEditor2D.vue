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
const selectedObject = ref<any>(null)


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
    deleteSelectedObject()
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
    console.log('🎯 오브젝트 선택됨:', selected?.userData)
    
    // placed-object는 두 모드에서 모두 선택 가능
    if (selected && selected.userData?.type === 'placed-object') {
      selectedObject.value = selected
      console.log('✅ 배치된 오브젝트 선택:', selected.userData?.placedObjectId)
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
  const objectsToRemove = fabricCanvas.getObjects().filter((obj: any) => 
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
      fill: placedObj.color || getObjectColor(placedObj.category),
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
  
  // 캔버스 중앙에 배치
  const canvasWidth = fabricCanvas.width || 800
  const canvasHeight = fabricCanvas.height || 600
  const centerX = canvasWidth / 2
  const centerY = canvasHeight / 2
  
  // 오브젝트 크기 (미터 단위를 픽셀로 변환) - 2D에서는 width(가로), depth(세로) 사용
  const meterToPixel = 40 // 1m = 40px
  const objectWidth = (object.width || 1) * meterToPixel   // 가로
  const objectHeight = (object.depth || 1) * meterToPixel  // 세로 (2D 표현용)
  
  // 카테고리별 색상 및 모양 설정
  let objectShape: any
  // GLB에서 추출한 색상이 있으면 사용, 없으면 카테고리 기본 색상 사용
  const objectColor = object.color || getObjectColor(object.category)
  const objectIcon = getObjectIcon(object.category)
  
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
    originY: 'center'
  })
  
  // 오브젝트 이름 레이블 추가
  const nameLabel = new fabric.Text(`${objectIcon} ${object.name}`, {
    left: 0, // 그룹 내에서의 상대 위치
    top: objectHeight / 2 + 10, // 오브젝트 아래쪽에 배치
    fontSize: 10,
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
      height: object.height
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
    description: object.description,
    width: object.width || 1,    // 가로 (2D X축)
    depth: object.depth || 1,    // 세로 (2D Y축)
    height: object.height || 2,  // 높이 (3D에서만 사용)
    position: {
      x: (centerX - canvasWidth / 2) / 40,  // 벽과 동일한 좌표 변환
      y: (centerY - canvasHeight / 2) / 40  // 벽과 동일한 좌표 변환
    },
    rotation: 0, // 초기 회전값
    color: object.color // GLB에서 추출한 색상 (있다면)
  }
  
  console.log('📦 Store에 오브젝트 추가 중:', placedObjectData)
  floorplanStore.addPlacedObject(placedObjectData)
  
  console.log('📦 Store 현재 상태 - placedObjects 개수:', floorplanStore.placedObjects.length)
  console.log('📦 Store 현재 상태 - placedObjects:', floorplanStore.placedObjects)
  
  // 🚀 핵심 개선: Store 기반 2D 재구성 (일관성 있는 렌더링)
  console.log('🔄 Store 변경으로 인한 2D 재구성 시작')
  rerender2DObjectsFromStore()
  console.log('✅ Store 기반 2D 재구성 완료')
  
  // 배치 완료 알림
  alert(`${object.name}이(가) 2D 뷰에 배치되었습니다!`)
}

// 카테고리별 색상 반환
const getObjectColor = (category: string): string => {
  const colorMap: { [key: string]: string } = {
    robot: '#FF6B6B',     // 빨간색 계열
    equipment: '#4ECDC4',  // 청록색 계열
    appliances: '#45B7D1', // 파란색 계열
    etc: '#96CEB4'        // 녹색 계열
  }
  return colorMap[category] || '#CCCCCC'
}

// 카테고리별 아이콘 반환
const getObjectIcon = (category: string): string => {
  const iconMap: { [key: string]: string } = {
    robot: '🤖',
    equipment: '⚙️',
    appliances: '🔌',
    etc: '📦'
  }
  return iconMap[category] || '📦'
}

const clearCanvas = () => {
  if (!fabricCanvas) return
  
  fabricCanvas.clear()
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