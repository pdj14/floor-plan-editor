import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 벽 데이터 타입 정의
interface Point {
  x: number
  y: number
}

interface Wall {
  start: Point
  end: Point
  id: string | number
}

interface Room {
  width: number
  height: number
  bounds?: {
    left: number
    top: number
    right: number
    bottom: number
  }
}

interface CanvasSize {
  width: number
  height: number
}

// 배치된 오브젝트 타입 정의
interface PlacedObject {
  id: string
  name: string
  category: string
  glbUrl: string
  lodUrl?: string   // LOD 모델 URL (선택사항)
  description?: string
  width: number  // 가로
  depth: number  // 세로
  height: number // 높이
  position: Point
  rotation: number // 회전 각도 (라디안)
  color?: string   // GLB에서 추출한 주요 색상 (hex)
  isOnBox?: boolean // 상자 위 배치 여부
  boxId?: string    // 상자 ID (상자 위에 배치된 경우)
  isBox?: boolean   // 상자 여부
  instancing?: boolean // 인스턴싱 활성화 여부
}

// Floorplan Store
export const useFloorplanStore = defineStore('floorplan', () => {
  // 상태 (state)
  const currentRoom = ref<Room | null>(null)
  const interiorWalls = ref<Wall[]>([])
  const exteriorWalls = ref<Wall[]>([]) // 외부벽도 직접 저장
  const placedObjects = ref<PlacedObject[]>([]) // 배치된 오브젝트들
  const canvasSize = ref<CanvasSize>({ width: 800, height: 600 })
  
  // Getters (computed)
  const hasRoom = computed(() => currentRoom.value !== null)
  
  // exteriorWalls를 computed에서 ref로 변경했으므로 제거
  // const exteriorWalls = computed(() => { ... }) -> 제거됨
  
  const roomCenterPosition = computed(() => {
    if (!currentRoom.value?.bounds) return { x: 0, y: 0 }
    
    const bounds = currentRoom.value.bounds
    return {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2
    }
  })
  
  const floorplanData = computed(() => ({
    exteriorWalls: exteriorWalls.value, // 이제 ref로 직접 접근
    interiorWalls: interiorWalls.value,
    placedObjects: placedObjects.value, // 배치된 오브젝트 정보 추가
    roomSize: currentRoom.value ? {
      width: currentRoom.value.width,
      height: currentRoom.value.height,
      centerX: roomCenterPosition.value.x,
      centerY: roomCenterPosition.value.y
    } : null,
    canvasSize: canvasSize.value
  }))
  
  // Actions (methods)
  const setRoom = (room: Room) => {
    currentRoom.value = room
  }
  
  const clearRoom = () => {
    currentRoom.value = null
    interiorWalls.value = []
    exteriorWalls.value = []
    placedObjects.value = []
  }
  
  const setCanvasSize = (size: CanvasSize) => {
    canvasSize.value = size
  }
  
  const addInteriorWall = (wall: Wall) => {
    interiorWalls.value.push(wall)
  }
  
  const updateInteriorWall = (wallId: string | number, updatedWall: Wall) => {
    const index = interiorWalls.value.findIndex(wall => wall.id === wallId)
    if (index > -1) {
      interiorWalls.value[index] = updatedWall
    }
  }
  
  const removeInteriorWall = (wallId: string | number) => {
    interiorWalls.value = interiorWalls.value.filter(wall => wall.id !== wallId)
  }
  
  const addExteriorWall = (wall: Wall) => {
    exteriorWalls.value.push(wall)
  }
  
  const updateExteriorWall = (wallId: string | number, updatedWall: Wall) => {
    const index = exteriorWalls.value.findIndex(wall => wall.id === wallId)
    if (index > -1) {
      exteriorWalls.value[index] = updatedWall
    }
  }
  
  const removeExteriorWall = (wallId: string | number) => {
    exteriorWalls.value = exteriorWalls.value.filter(wall => wall.id !== wallId)
  }

  const clearInteriorWalls = () => {
    interiorWalls.value = []
  }
  
  const clearExteriorWalls = () => {
    exteriorWalls.value = []
  }

  // 배치된 오브젝트 관리 액션들
  const addPlacedObject = (object: PlacedObject) => {
    placedObjects.value.push(object)
  }
  
  const updatePlacedObject = (objectId: string, updatedObject: PlacedObject) => {
    const index = placedObjects.value.findIndex(obj => obj.id === objectId)
    if (index > -1) {
      placedObjects.value[index] = updatedObject
    }
  }
  
  const removePlacedObject = (objectId: string) => {
    placedObjects.value = placedObjects.value.filter(obj => obj.id !== objectId)
  }
  
  const clearPlacedObjects = () => {
    placedObjects.value = []
  }

  // 모든 배치된 오브젝트의 인스턴싱 값 업데이트
  const updateAllPlacedObjectsInstancing = (enabled: boolean) => {
    placedObjects.value.forEach(obj => {
      obj.instancing = enabled
    })
    console.log(`🎯 모든 배치된 오브젝트 인스턴싱 ${enabled ? '활성화' : '비활성화'}`)
  }
  
  const logCurrentState = () => {
    // 디버깅용 함수 (빈 함수로 유지)
  }
  
  return {
    // State
    currentRoom,
    interiorWalls,
    exteriorWalls, // 외부벽 추가
    placedObjects, // 배치된 오브젝트 추가
    canvasSize,
    
    // Getters
    hasRoom,
    roomCenterPosition,
    floorplanData,
    
    // Actions
    setRoom,
    clearRoom,
    setCanvasSize,
    addInteriorWall,
    updateInteriorWall,
    removeInteriorWall,
    clearInteriorWalls,
    addExteriorWall, // 외부벽 액션들 추가
    updateExteriorWall,
    removeExteriorWall,
    clearExteriorWalls,
    addPlacedObject, // 배치된 오브젝트 액션들 추가
    updatePlacedObject,
    removePlacedObject,
    clearPlacedObjects,
    updateAllPlacedObjectsInstancing, // 인스턴싱 업데이트 함수 추가
    logCurrentState
  }
}) 