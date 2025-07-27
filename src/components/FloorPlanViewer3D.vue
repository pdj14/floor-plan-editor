<template>
  <div class="viewer-3d-container">
    <!-- 3D 컨트롤 툴바 -->
    <div class="controls-toolbar">
      <div class="control-group">
        <button @click="resetCamera" class="btn btn-secondary" title="Reset Camera">
          🏠 Reset View
        </button>
        <button @click="toggleWireframe" class="btn btn-secondary" title="Toggle Wireframe">
          {{ wireframe ? '🔲' : '⬜' }} Wireframe
        </button>
        <button @click="toggleLights" class="btn btn-secondary" title="Toggle Lights">
          {{ lightsOn ? '💡' : '🔅' }} Lights
        </button>
      </div>
      
      <div class="control-group">
        <button @click="make3D" class="btn btn-primary" title="Convert 2D to 3D">
          🎯 Make3D
        </button>
        <button @click="clearAll3D" class="btn btn-danger" title="Clear All 3D Objects">
          🗑️ Clear 3D
        </button>
      </div>
      
      <div class="control-group">
        <label>
          Height: {{ wallHeight }}m
          <input 
            type="range" 
            v-model="wallHeight" 
            min="2" 
            max="5" 
            step="0.1"
            @input="updateWallHeight"
          />
        </label>
      </div>
    </div>

    <!-- 3D 캔버스 -->
    <div class="canvas-3d" ref="canvas3dContainer">
      <canvas ref="canvas3d" />
      
      <!-- 로딩 표시 -->
      <div v-if="loading" class="loading-overlay">
        <div class="loading"></div>
        <p>Loading 3D models...</p>
      </div>
    </div>

    <!-- 정보 패널 -->
    <div class="info-panel">
      <div class="stats">
        <span>Objects: {{ objects.length }}</span>
        <span>Polygons: {{ polygonCount }}</span>
        <span>FPS: {{ fps }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useFloorplanStore } from '../stores/floorplanStore'

// 상태 관리
const canvas3d = ref<HTMLCanvasElement>()
const canvas3dContainer = ref<HTMLDivElement>()

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let animationId: number

const loading = ref(false)
const wireframe = ref(false)
const lightsOn = ref(true)
const wallHeight = ref(2.5)
const objects = ref<THREE.Object3D[]>([])
const polygonCount = ref(0)
const fps = ref(0)

// Pinia Store 사용
const floorplanStore = useFloorplanStore()

// Three.js 초기화
const initThreeJS = () => {
  if (!canvas3d.value || !canvas3dContainer.value) return

  const container = canvas3dContainer.value
  const width = container.clientWidth
  const height = container.clientHeight

  // 씬 생성
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf0f0f0)

  // 카메라 생성
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  
  // 초기 카메라 위치: 약간 비스듬히 내려다보는 뷰 (더 자연스러움)
  camera.position.set(0, 15, 0)  // 대각선 위에서 내려다보기
  camera.lookAt(0, 0, 0)
  // camera.up 설정을 기본값(0, 1, 0)으로 유지

  // 렌더러 생성
  renderer = new THREE.WebGLRenderer({ 
    canvas: canvas3d.value,
    antialias: true,
    alpha: true
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)
  // 그림자 효과 제거됨 - 사용자 요청에 따라
  renderer.shadowMap.enabled = false
  // renderer.shadowMap.type = THREE.PCFSoftShadowMap -> 제거됨

  // 컨트롤 설정 (자연스러운 조작을 위해 수정)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.25
  controls.maxPolarAngle = Math.PI / 2 // 지면 아래로 볼 수 없도록 제한
  controls.minPolarAngle = 0 // 위쪽 제한
  controls.target.set(0, 0, 0)  // 원점을 중심으로 회전
  
  // 마우스 조작을 자연스럽게 만들기 위한 설정
  controls.screenSpacePanning = false  // 화면 공간 패닝 비활성화
  controls.enablePan = true  // 패닝 활성화
  controls.enableZoom = true  // 줌 활성화
  controls.enableRotate = true  // 회전 활성화
  
  // 회전 속도 조정 (필요시)
  controls.rotateSpeed = 1.0
  controls.zoomSpeed = 1.2
  controls.panSpeed = 0.8

  // 조명 설정
  setupLights()

  // 초기 상태는 빈 상태 - Make3D 버튼으로만 객체 생성
  // addDefaultFloor() 제거

  // 렌더링 시작
  animate()
}

// 조명 설정
const setupLights = () => {
  // 환경광 (더 밝게 조정)
  const ambientLight = new THREE.AmbientLight(0x404040, 0.8)
  scene.add(ambientLight)

  // 방향광 (그림자 품질 향상)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6)
  directionalLight.position.set(10, 10, 5)
  // 그림자 효과 제거됨
  directionalLight.castShadow = false
  // directionalLight.shadow 설정들 제거됨
  scene.add(directionalLight)

  // 포인트 라이트 (실내 조명)
  const pointLight = new THREE.PointLight(0xffffff, 0.4, 20)
  pointLight.position.set(0, 3, 0)
  scene.add(pointLight)
}

// 실시간 3D 업데이트 제거로 인해 addDefaultFloor 함수 비활성화
// Make3D 버튼으로만 바닥 생성
// const addDefaultFloor = () => {
//   const floorGeometry = new THREE.PlaneGeometry(20, 20)
//   const floorMaterial = new THREE.MeshLambertMaterial({ 
//     color: 0xe6f3ff, // 2D와 동일한 색상 (#e6f3ff)
//     transparent: true,
//     opacity: 0.8
//   })
//   
//   const floor = new THREE.Mesh(floorGeometry, floorMaterial)
//   floor.rotation.x = -Math.PI / 2
//   floor.receiveShadow = false // 바닥 그림자 제거
//   floor.userData.type = 'default-floor'
//   scene.add(floor)
// }



// 2D 평면도에서 3D 벽 생성
const create3DWalls = (wallsData: any) => {
  const existingWalls = []
  scene.traverse((child) => {
    if (child.userData.type === 'exterior-wall' || child.userData.type === 'interior-wall') {
      existingWalls.push(child)
    }
  })
  
  existingWalls.forEach(wall => {
    scene.remove(wall)
    if (wall.geometry) wall.geometry.dispose()
    if (wall.material) wall.material.dispose()
  })

  if ((!wallsData.exteriorWalls || wallsData.exteriorWalls.length === 0) && 
      (!wallsData.interiorWalls || wallsData.interiorWalls.length === 0)) {
    return
  }

  const canvasWidth = wallsData.canvasSize?.width || 800
  const canvasHeight = wallsData.canvasSize?.height || 600

  // 외벽 생성 (2D와 동일한 색상: #999999)
  if (wallsData.exteriorWalls) {
    wallsData.exteriorWalls.forEach((wall: any, index: number) => {
      createWall(wall, 'exterior-wall', 0x999999, canvasWidth, canvasHeight, false)
    })
  }

  // 내벽 생성 (2D와 동일한 색상: #666666)
  if (wallsData.interiorWalls) {
    wallsData.interiorWalls.forEach((wall: any, index: number) => {
      createWall(wall, 'interior-wall', 0x666666, canvasWidth, canvasHeight, false)
    })
  }
}

// 개별 벽 생성 함수
const createWall = (wall: any, wallType: string, color: number, canvasWidth: number, canvasHeight: number) => {
  const start = wall.start
  const end = wall.end
  
  const length = Math.sqrt(
    Math.pow(end.x - start.x, 2) + Math.pow(start.y - end.y, 2)
  )
  const angle = Math.atan2(start.y - end.y, end.x - start.x)
  
  const wallGeometry = new THREE.BoxGeometry(length / 40, wallHeight.value, 0.1)
  const wallMaterial = new THREE.MeshLambertMaterial({ 
    color: color,
    transparent: false,
    opacity: 1.0
  })
  
  const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial)
  
  const centerX = (start.x + end.x) / 2
  const centerY = (start.y + end.y) / 2
  
  const pos3D_X = (centerX - canvasWidth / 2) / 40
  const pos3D_Y = wallHeight.value / 2
  const pos3D_Z = (centerY - canvasHeight / 2) / 40
  
  wallMesh.position.set(pos3D_X, pos3D_Y, pos3D_Z)
  
  wallMesh.rotation.y = angle
  wallMesh.castShadow = false
  wallMesh.receiveShadow = false
  wallMesh.userData.type = wallType
  
  if (wall.id) {
    wallMesh.userData.wallId = wall.id
  }
  
  scene.add(wallMesh)
}

// GLB 모델 로드 (좌표계 수정에 맞게 업데이트)
const loadGLBModel = async (url: string, position: { x: number, y: number, z?: number }, canvasWidth = 800, canvasHeight = 600) => {
  loading.value = true
  
  try {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    
    const model = gltf.scene
    
    const pos3D_X = (position.x - canvasWidth / 2) / 40
    const pos3D_Y = position.z || 0
    const pos3D_Z = (position.y - canvasHeight / 2) / 40
    
    model.position.set(pos3D_X, pos3D_Y, pos3D_Z)
    
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false
        child.receiveShadow = false
      }
    })
    
    scene.add(model)
    objects.value.push(model)
    
  } catch (error) {
    console.error('❌ GLB 모델 로딩 실패:', error)
  } finally {
    loading.value = false
  }
}

// 애니메이션 루프
let lastTime = 0
const animate = (currentTime = 0) => {
  animationId = requestAnimationFrame(animate)
  
  // FPS 계산
  if (currentTime - lastTime >= 1000) {
    fps.value = Math.round(1000 / (currentTime - lastTime))
    lastTime = currentTime
  }
  
  controls.update()
  
  // 폴리곤 수 계산
  updatePolygonCount()
  
  renderer.render(scene, camera)
}

// 폴리곤 수 업데이트
const updatePolygonCount = () => {
  let count = 0
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry
      if (geometry.index) {
        count += geometry.index.count / 3
      } else {
        count += geometry.attributes.position.count / 3
      }
    }
  })
  polygonCount.value = Math.round(count)
}

// 컨트롤 함수들
const resetCamera = () => {
  camera.position.set(0, 15, 0)
  camera.lookAt(0, 0, 0)
  // camera.up은 기본값 (0, 1, 0) 유지
  controls.target.set(0, 0, 0)
  controls.update()
}

const toggleWireframe = () => {
  wireframe.value = !wireframe.value
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.Material) {
      object.material.wireframe = wireframe.value
    }
  })
}

const toggleLights = () => {
  lightsOn.value = !lightsOn.value
  scene.traverse((object) => {
    if (object instanceof THREE.Light) {
      object.visible = lightsOn.value
    }
  })
}

const updateWallHeight = () => {
  scene.traverse((object) => {
    if ((object.userData.type === 'exterior-wall' || object.userData.type === 'interior-wall') && object instanceof THREE.Mesh) {
      // 기존 지오메트리 제거하고 새로운 높이로 재생성
      object.geometry.dispose()
      
      // 현재 벽의 길이와 두께 계산
      const boundingBox = new THREE.Box3().setFromObject(object)
      const width = boundingBox.max.x - boundingBox.min.x
      const depth = 0.2 // 벽 두께 고정
      
      // 새 지오메트리 생성
      object.geometry = new THREE.BoxGeometry(width, wallHeight.value, depth)
      object.position.y = wallHeight.value / 2
    }
  })
}

// Store를 사용한 Make3D - 2D 객체들을 상세한 3D로 변환
const make3D = () => {
  if (loading.value) return
  
  loading.value = true
  
  try {
    const data = floorplanStore.floorplanData

    if (!data || !data.roomSize) {
      return
    }

    if ((!data.exteriorWalls || data.exteriorWalls.length === 0) && 
        (!data.interiorWalls || data.interiorWalls.length === 0)) {
      return
    }

    create3DWalls(data)
    addEnhanced3DFeatures()
    
  } catch (error) {
    console.error('❌ Make3D 중 오류 발생:', error)
  } finally {
    loading.value = false
  }
}

// 향상된 3D 기능 추가 (저장된 데이터 사용)
const addEnhanced3DFeatures = () => {
  if (!scene) {
    return
  }

  const exteriorWalls = scene.children.filter(child => child.userData.type === 'exterior-wall')
  
  if (exteriorWalls.length === 0) {
    return
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  
  exteriorWalls.forEach(wall => {
    const box = new THREE.Box3().setFromObject(wall)
    minX = Math.min(minX, box.min.x)
    maxX = Math.max(maxX, box.max.x)
    minZ = Math.min(minZ, box.min.z)
    maxZ = Math.max(maxZ, box.max.z)
  })
  
  const roomWidth = maxX - minX
  const roomDepth = maxZ - minZ
  const roomCenterX = (minX + maxX) / 2
  const roomCenterZ = (minZ + maxZ) / 2
  
  addEnhancedLighting(roomCenterX, roomCenterZ, roomWidth, roomDepth)
}

// 천장 기능 제거됨 - 사용자 요청에 따라
// const addCeiling = ... (제거됨)

// 향상된 조명 추가 (SpotLight 제거됨)
const addEnhancedLighting = (centerX: number, centerZ: number, width: number, depth: number) => {
  const roomLight = new THREE.PointLight(0xffffff, 0.8, Math.max(width, depth) * 1.5)
  roomLight.position.set(centerX, 2, centerZ)
  roomLight.castShadow = false
  roomLight.userData.type = 'room-light'
  scene.add(roomLight)
}

// 그림자 기능 제거됨 - 사용자 요청에 따라  
// const enhanceShadows = ... (제거됨)

// Clear All 3D - 모든 3D 객체 제거
const clearAll3D = () => {
  if (!scene) return

  const objectTypesToRemove = [
    'exterior-wall', 'interior-wall', 'room-floor', 'ceiling', 
    'room-light', 'corner-light', 'wall-decoration'
  ]
  
  const objectsToRemove: THREE.Object3D[] = []
  
  scene.traverse((child) => {
    if (child !== scene && child.userData.type && objectTypesToRemove.includes(child.userData.type)) {
      objectsToRemove.push(child)
    }
  })
  
  objectsToRemove.forEach(obj => {
    scene.remove(obj)
    
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry) {
        obj.geometry.dispose()
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose())
        } else {
          obj.material.dispose()
        }
      }
    }
  })
  
  objects.value = objects.value.filter(obj => !objectsToRemove.includes(obj))
  
  renderer.render(scene, camera)
}

// 윈도우 리사이즈 처리
const handleResize = () => {
  if (!canvas3dContainer.value) return
  
  const container = canvas3dContainer.value
  const width = container.clientWidth
  const height = container.clientHeight
  
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  
  // Store에 캔버스 크기 업데이트 (3D 뷰어 크기 변경 시)
  floorplanStore.setCanvasSize({ width, height })
}

// 라이프사이클
onMounted(() => {
  initThreeJS()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  window.removeEventListener('resize', handleResize)
  
  // Three.js 리소스 정리
  if (renderer) {
    renderer.dispose()
  }
  controls?.dispose()
})

// (handleWallUpdate 함수는 제거됨 - App.vue에서 직접 create3DWalls 호출)

// 외부에서 호출할 수 있는 함수들
defineExpose({
  create3DWalls,
  loadGLBModel,
  make3D,
  clearAll3D
})
</script>

<style scoped>
.viewer-3d-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8f9fa;
}

.controls-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: white;
  border-bottom: 1px solid #ddd;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.control-group {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.control-group label {
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
  color: #666;
}

.control-group input[type="range"] {
  width: 100px;
  margin-top: 0.25rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background: #3498db;
  color: white;
}

.btn-primary:hover {
  background: #2980b9;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.btn-secondary {
  background: #95a5a6;
  color: white;
}

.btn-secondary:hover {
  background: #7f8c8d;
}

.btn-danger {
  background: #e74c3c;
  color: white;
}

.btn-danger:hover {
  background: #c0392b;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.canvas-3d {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.canvas-3d canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1rem;
}

.info-panel {
  padding: 0.5rem;
  background: white;
  border-top: 1px solid #ddd;
}

.stats {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: #666;
}
</style> 