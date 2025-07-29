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
import { ref, onMounted, onUnmounted, watch } from 'vue'
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
  
  console.log('📐 컨테이너 크기:', width, 'x', height)
  
  if (width === 0 || height === 0) {
    console.warn('⚠️ 컨테이너 크기가 0입니다. CSS 스타일을 확인해주세요.')
    return
  }

  // 씬 생성
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf0f0f0)

  // 카메라 생성
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  
  // 초기 카메라 위치: 약간 비스듬히 내려다보는 뷰 (더 자연스러움)
  camera.position.set(0, 15, 0)  // 대각선 위에서 내려다보기
  camera.lookAt(0, 0, 0)
  // camera.up 설정을 기본값(0, 1, 0)으로 유지

  // 렌더러 생성 (GLB 색상 정확한 표현을 위한 최적화)
  renderer = new THREE.WebGLRenderer({ 
    canvas: canvas3d.value,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance"
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // 성능 최적화
  renderer.outputColorSpace = THREE.SRGBColorSpace // GLB 색상 정확한 표현
  renderer.toneMapping = THREE.NoToneMapping // 톤매핑 비활성화로 원본 색상 보존
  renderer.toneMappingExposure = 1.0
  
  // 그림자 효과 제거됨 - 사용자 요청에 따라
  renderer.shadowMap.enabled = false
  // renderer.shadowMap.type = THREE.PCFSoftShadowMap -> 제거됨
  
  console.log('🎨 GLB 색상 정확한 표현을 위한 렌더러 설정 완료')

  // 🎮 카메라 컨트롤 설정 (마우스 조작 최적화)
  controls = new OrbitControls(camera, renderer.domElement)
  
  // 기본 설정
  controls.enableDamping = true
  controls.dampingFactor = 0.25
  
  // 카메라 각도 제한
  controls.maxPolarAngle = Math.PI / 2 // 지면 아래로 볼 수 없도록 제한
  controls.minPolarAngle = 0 // 위쪽 제한
  controls.target.set(0, 0, 0)  // 초기 타겟
  
  // 🖱️ 마우스 조작 설정
  controls.screenSpacePanning = true  // 화면 공간 패닝 활성화 (더 직관적)
  controls.enablePan = true  // 패닝 활성화
  controls.enableZoom = true  // 줌 활성화
  controls.enableRotate = true  // 회전 활성화
  
  // 마우스 버튼 매핑 설정 (요청사항에 맞게)
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,    // 좌클릭: 회전
    MIDDLE: THREE.MOUSE.DOLLY,   // 중간버튼: 줌
    RIGHT: THREE.MOUSE.PAN       // 우클릭: 이동
  }
  
  // 컨트롤 속도 최적화
  controls.rotateSpeed = 1.0
  controls.zoomSpeed = 1.5
  controls.panSpeed = 1.2
  
  // 카메라 이동 범위 설정
  controls.maxDistance = 50  // 최대 줌 아웃 거리
  controls.minDistance = 1   // 최소 줌 인 거리
  
  // 컨트롤 초기화 완료
  controls.update()
  
  console.log('🎮 3D 카메라 컨트롤 활성화 완료:')
  console.log('   🖱️ 좌클릭 + 드래그: 카메라 회전')
  console.log('   🖱️ 우클릭 + 드래그: 카메라 이동')
  console.log('   🔍 마우스 휠: 줌 인/아웃')
  console.log('   📍 현재 카메라 위치:', camera.position.toArray())
  
  // 🧪 컨트롤 작동 테스트를 위한 이벤트 리스너
  renderer.domElement.addEventListener('mousedown', (event) => {
    console.log('🖱️ 마우스 다운:', event.button, '버튼')
  })
  
  renderer.domElement.addEventListener('wheel', (event) => {
    console.log('🔍 마우스 휠:', event.deltaY > 0 ? '줌 아웃' : '줌 인')
  })
  

  // 조명 설정
  setupLights()

  // 초기 상태는 빈 상태 - Make3D 버튼으로만 객체 생성
  // addDefaultFloor() 제거

  // 렌더링 시작
  animate()
}

  // 조명 설정 (하얀색이 완전히 밝게 보이도록 극한 조명)
  const setupLights = () => {
    // 환경광 (하얀색이 완전히 밝게 보이도록 극한 환경광)
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0) // 하얀색 완전 밝은 표현을 위한 극한 환경광
    scene.add(ambientLight)
    console.log('환경광 설정: 2.0 강도 (하얀색 완전 밝은 표현)')

    // 주 방향광 (하얀색이 완전히 밝게 보이도록 극한 방향광)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5) // 하얀색을 완전히 밝게 보이게 하는 극한 방향광
    directionalLight.position.set(5, 8, 3)
    directionalLight.castShadow = false
    scene.add(directionalLight)
    console.log('주 방향광 설정: 1.5 강도 (하얀색 완전 밝은 표현)')

    // 보조 방향광 (하얀색 균등 극한 조명)
    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0) // 하얀색 균등 극한 조명
    fillLight.position.set(-5, 5, -3)
    fillLight.castShadow = false
    scene.add(fillLight)
    console.log('보조 방향광 설정: 1.0 강도 (하얀색 균등 극한 조명)')
    
    console.log('✅ 하얀색 완전 밝은 표현을 위한 극한 조명 설정 완료 (총 조명 강도: 4.5)')
    console.log('🎨 하얀색이 완전히 밝게 보입니다')
    console.log('💡 극한 조명 강도로 색상 완전 표현')
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

  if (wallsData.exteriorWalls) {
    wallsData.exteriorWalls.forEach((wall: any, index: number) => {
      createWall(wall, 'exterior-wall', 0xd3d3d3, canvasWidth, canvasHeight, false)
    })
  }

  if (wallsData.interiorWalls) {
    wallsData.interiorWalls.forEach((wall: any, index: number) => {
      createWall(wall, 'interior-wall', 0xd3d3d3, canvasWidth, canvasHeight, false)
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
  scene.traverse((object) => {ㅋ
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

// ✅ 색상 처리 함수들 완전 제거 - GLB 원본 색상 100% 보존
// 더 이상 색상을 인위적으로 변경하지 않습니다.
// GLB 파일의 디자이너가 의도한 원본 색상과 재질을 그대로 사용합니다.

// GLB 모델의 원본 재질 정보만 로그 출력 (변경하지 않음)
const logOnlyOriginalMaterials = (model: any) => {
  let materialCount = 0
  
  model.traverse((child: any) => {
    if (child.isMesh && child.material) {
      materialCount++
      console.log(`Mesh 발견: ${child.name || `Mesh${materialCount}`}`)
      
      if (Array.isArray(child.material)) {
        // 배열인 경우 각 재질 정보 로그
        child.material.forEach((mat: any, index: number) => {
          console.log(`  재질 배열[${index}]: ${mat.type}`)
          logOriginalMaterialColor(mat, index)
          console.log(`    → 원본 재질 보존됨 (변경 없음)`)
        })
      } else {
        // 단일 재질인 경우
        console.log(`  단일 재질: ${child.material.type}`)
        logOriginalMaterialColor(child.material, 0)
        console.log(`    → 원본 재질 보존됨 (변경 없음)`)
      }
    }
  })
  
  console.log(`총 ${materialCount}개 Mesh의 원본 재질을 그대로 사용`)
}

// 원본 재질 색상 로그
const logOriginalMaterialColor = (material: any, index: number) => {
  if (material.color) {
    const r = Math.round(material.color.r * 255)
    const g = Math.round(material.color.g * 255) 
    const b = Math.round(material.color.b * 255)
    console.log(`    → 원본 색상[${index}]: RGB(${r}, ${g}, ${b})`)
  }
  
  // 재질 종류별 정보
  if (material.isMeshStandardMaterial) {
    console.log(`    → 표준 재질 (조명 효과 O, 텍스처 O, 깊이감 O)`)
  } else if (material.isMeshPhysicalMaterial) {
    console.log(`    → 물리 재질 (조명 효과 O, 고급 반사 O)`)
  } else if (material.isMeshLambertMaterial) {
    console.log(`    → 램버트 재질 (조명 효과 O, 기본)`)
  }
}

// GLB에서 주요 색상 추출 함수
const extractPrimaryColor = (model: any): string => {
  const colors: { r: number, g: number, b: number, count: number }[] = []
  
  model.traverse((child: any) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      materials.forEach((mat: any) => {
        if (mat.color) {
          // 기존 색상이 있는지 확인 (유사한 색상 그룹화)
          const existingColor = colors.find(c => 
            Math.abs(c.r - mat.color.r) < 0.1 && 
            Math.abs(c.g - mat.color.g) < 0.1 && 
            Math.abs(c.b - mat.color.b) < 0.1
          )
          
          if (existingColor) {
            existingColor.count++
          } else {
            colors.push({
              r: mat.color.r,
              g: mat.color.g,
              b: mat.color.b,
              count: 1
            })
          }
        }
      })
    }
  })
  
  // 가장 많이 사용된 색상을 주요 색상으로 선택
  if (colors.length === 0) {
    return '#CCCCCC' // 기본 회색
  }
  
  const primaryColor = colors.reduce((prev, current) => 
    (prev.count > current.count) ? prev : current
  )
  
  // RGB를 HEX로 변환
  const r = Math.round(primaryColor.r * 255)
  const g = Math.round(primaryColor.g * 255)
  const b = Math.round(primaryColor.b * 255)
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// GLB 재질 정보 로그 함수
const logMaterialInfo = (material: any, name: string) => {
  console.log(`  ${name}:`)
  
  // 기본 색상
  if (material.color) {
    console.log(`    - 기본 색상: RGB(${Math.round(material.color.r * 255)}, ${Math.round(material.color.g * 255)}, ${Math.round(material.color.b * 255)})`)
  }
  
  // PBR 재질 속성들
  if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
    if (material.emissive) {
      console.log(`    - 발광 색상: RGB(${Math.round(material.emissive.r * 255)}, ${Math.round(material.emissive.g * 255)}, ${Math.round(material.emissive.b * 255)})`)
    }
    if (material.metalness !== undefined) {
      console.log(`    - 금속성: ${material.metalness}`)
    }
    if (material.roughness !== undefined) {
      console.log(`    - 거칠기: ${material.roughness}`)
    }
  }
  
  // 텍스처 정보
  if (material.map) {
    console.log(`    - 기본 텍스처: 있음`)
  }
  if (material.normalMap) {
    console.log(`    - 노멀 맵: 있음`)
  }
  if (material.roughnessMap) {
    console.log(`    - 거칠기 맵: 있음`)
  }
  if (material.metalnessMap) {
    console.log(`    - 금속성 맵: 있음`)
  }
  
  // 투명도
  if (material.transparent && material.opacity !== undefined) {
    console.log(`    - 투명도: ${material.opacity}`)
  }
}

// 실시간 3D 오브젝트 업데이트 (Store 변경 감지용)
const updatePlacedObjectsIn3D = async (placedObjects: any[]) => {
  console.log('🔄 updatePlacedObjectsIn3D 실행 시작')
  console.log('🔄 전달받은 placedObjects:', placedObjects)
  
  if (!scene) {
    console.log('❌ Scene 없음')
    return
  }

  // 기존 배치 오브젝트 모두 제거
  const existingObjects = scene.children.filter(child => child.userData.type === 'placed-object')
  console.log(`🗑️ 3D Scene에서 제거할 기존 오브젝트 개수: ${existingObjects.length}`)
  
  existingObjects.forEach((obj, index) => {
    console.log(`🗑️ 제거 중 ${index + 1}/${existingObjects.length}: ${obj.userData.placedObjectId || obj.userData.id || 'unknown'}`)
    console.log(`🗑️ userData 전체:`, obj.userData)
    scene.remove(obj)
    if (obj.traverse) {
      obj.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: any) => mat.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
    }
  })

  console.log(`✅ 기존 오브젝트 ${existingObjects.length}개 제거 완료`)
  
  // Scene 상태 확인
  const remainingObjects = scene.children.filter(child => child.userData.type === 'placed-object')
  console.log(`🔍 제거 후 Scene에 남은 placed-object 개수: ${remainingObjects.length}`)
  
  console.log(`🔍 Scene 전체 children 개수: ${scene.children.length}`)
  console.log(`🔍 Scene children 타입들:`, scene.children.map(child => child.userData.type || child.type))

  // 새로운 오브젝트들 추가
  if (placedObjects.length > 0) {
    console.log(`📦 ${placedObjects.length}개 오브젝트 3D 업데이트 중...`)
    await create3DObjects(placedObjects)
  } else {
    console.log('📦 모든 3D 오브젝트 제거됨 - 새로 추가할 오브젝트 없음')
  }

  // 강제 렌더링 업데이트 (여러 방법 시도)
  if (renderer && camera) {
    console.log(`🔍 카메라 위치: (${camera.position.x}, ${camera.position.y}, ${camera.position.z})`)
    console.log(`🔍 카메라 타겟:`, controls?.target || 'No controls')
    console.log(`🔍 Scene에 있는 placed-object 수: ${scene.children.filter(child => child.userData?.type === 'placed-object').length}`)
    
    // Scene 강제 업데이트
    scene.updateMatrixWorld(true)
    
    // 여러 번 렌더링 시도
    renderer.render(scene, camera)
    console.log('✅ 3D 첫 번째 렌더링 완료')
    
    requestAnimationFrame(() => {
      renderer.render(scene, camera)
      console.log('✅ 3D 두 번째 렌더링 완료 (requestAnimationFrame)')
      
      // 최종 상태 확인
      const finalObjectCount = scene.children.filter(child => child.userData?.type === 'placed-object').length
      console.log(`🔍 최종 렌더링 후 placed-object 수: ${finalObjectCount}`)
    })
    
    console.log('✅ 3D 렌더링 업데이트 완료 (즉시)')
  } else {
    console.log('❌ renderer 또는 camera 없음')
  }
  
  console.log('🔄 updatePlacedObjectsIn3D 실행 완료')
}

// 3D 오브젝트 생성 (GLB 모델 로딩)
const create3DObjects = async (placedObjects: any[]) => {
  console.log('🎯 create3DObjects 호출됨')
  console.log('🎯 Scene 존재:', !!scene)
  console.log('🎯 placedObjects:', placedObjects)
  console.log('🎯 placedObjects 길이:', placedObjects?.length)
  
  if (!scene || !placedObjects || placedObjects.length === 0) {
    console.log('❌ create3DObjects 중단: scene 없음 또는 오브젝트 없음')
    return
  }
  
  console.log('✅ create3DObjects 실행 시작')

  // 기존 배치 오브젝트 제거
  const existingObjects = scene.children.filter(child => child.userData.type === 'placed-object')
  existingObjects.forEach(obj => {
    scene.remove(obj)
    if (obj.traverse) {
      obj.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: any) => mat.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
    }
  })

  // GLTFLoader 사용하여 GLB 모델 로딩
  const loader = new GLTFLoader()
  
  for (const placedObj of placedObjects) {
    let extractedColor = '#CCCCCC' // 기본 색상
    
    // 상자인 경우 특별한 3D 상자 모델 생성
    if (placedObj.category === 'etc' && placedObj.isBox) {
      console.log(`📦 상자 3D 모델 생성: ${placedObj.name}`)
      create3DBox(placedObj, placedObj.color || '#D2B48C')
      continue
    }
    
    try {
      console.log(`=== ${placedObj.name} GLB 로딩 시작: ${placedObj.glbUrl} ===`)
      
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.load(
          placedObj.glbUrl,
          (gltf) => {
            console.log(`${placedObj.name} GLB 로딩 성공!`)
            resolve(gltf)
          },
          (progress) => {
            console.log(`${placedObj.name} 로딩 진행률: ${(progress.loaded / progress.total * 100).toFixed(1)}%`)
          },
          (error) => {
            console.error(`${placedObj.name} GLB 로딩 실패:`, error)
            reject(error)
          }
        )
      })

      const model = gltf.scene.clone()
      console.log(`🔍 ${placedObj.name} 모델 복제 완료. 자식 수: ${model.children.length}`)
      console.log(`🔍 모델 바운딩박스:`, model)
      
      // GLB에서 주요 색상 추출
      extractedColor = extractPrimaryColor(model)
      console.log(`🔍 ${placedObj.name} 추출된 주요 색상: ${extractedColor}`)
      
      // 모델이 실제로 로드되었는지 확인
      let meshCount = 0
      model.traverse((child) => {
        if (child.isMesh) {
          meshCount++
          console.log(`🔍 Mesh ${meshCount}: ${child.name || 'Unnamed'}, geometry: ${child.geometry?.type}`)
        }
      })
      console.log(`🔍 총 Mesh 개수: ${meshCount}`)
      
      // GLB 색상 강화 적용 (벽과 구분되도록)
      console.log(`=== ${placedObj.name} GLB 색상 처리 시작 ===`)
      logOnlyOriginalMaterials(model) // 원본 재질 로그
      
      // GLB 원본 색상 강제 적용 (추출된 색상으로 명시적 설정)
      console.log(`🎨 GLB 추출 색상 강제 적용: ${extractedColor}`)
      console.log(`✨ 추출된 색상을 모든 재질에 명시적으로 적용`)
      
      // GLB 추출 색상을 모든 재질에 강제 적용
      let appliedMaterialCount = 0
      const extractedColorRGB = new THREE.Color(extractedColor)
      
      model.traverse((child: any) => {
        if (child.isMesh && child.material) {
          appliedMaterialCount++
          
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: any, index: number) => {
              console.log(`  재질[${index}] ${mat.type}: 원본 RGB(${mat.color?.r.toFixed(3) || 'N/A'}, ${mat.color?.g.toFixed(3) || 'N/A'}, ${mat.color?.b.toFixed(3) || 'N/A'})`)
              
              // 추출된 색상으로 강제 적용
              mat.color = extractedColorRGB.clone()
              mat.needsUpdate = true
              
              console.log(`  → 적용된 색상: ${extractedColor} (RGB: ${extractedColorRGB.r.toFixed(3)}, ${extractedColorRGB.g.toFixed(3)}, ${extractedColorRGB.b.toFixed(3)})`)
            })
          } else {
            console.log(`  재질 ${child.material.type}: 원본 RGB(${child.material.color?.r.toFixed(3) || 'N/A'}, ${child.material.color?.g.toFixed(3) || 'N/A'}, ${child.material.color?.b.toFixed(3) || 'N/A'})`)
            
            // 추출된 색상으로 강제 적용
            child.material.color = extractedColorRGB.clone()
            child.material.needsUpdate = true
            
            console.log(`  → 적용된 색상: ${extractedColor} (RGB: ${extractedColorRGB.r.toFixed(3)}, ${extractedColorRGB.g.toFixed(3)}, ${extractedColorRGB.b.toFixed(3)})`)
          }
        }
      })
      
      console.log(`✅ ${appliedMaterialCount}개 재질에 추출 색상 ${extractedColor} 강제 적용 완료`)
      
      console.log(`=== ${placedObj.name} GLB 색상 처리 완료 ===`)
      
      // 모델 크기 조정 (width, depth, height 기준) - 먼저 스케일 적용
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const scaleX = placedObj.width / size.x   // 가로 (X축)
      const scaleZ = placedObj.depth / size.z   // 세로 (Z축)  
      const scaleY = placedObj.height / size.y  // 높이 (Y축)
      
      model.scale.set(scaleX, scaleY, scaleZ)
      
      // 스케일 적용 후 다시 바운딩박스 계산
      const scaledBox = new THREE.Box3().setFromObject(model)
      const scaledSize = scaledBox.getSize(new THREE.Vector3())
      
      console.log(`${placedObj.name} 원본 크기: ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}`)
      console.log(`${placedObj.name} 스케일: ${scaleX.toFixed(3)} x ${scaleY.toFixed(3)} x ${scaleZ.toFixed(3)}`)
      console.log(`${placedObj.name} 스케일 후 크기: ${scaledSize.x.toFixed(3)} x ${scaledSize.y.toFixed(3)} x ${scaledSize.z.toFixed(3)}`)
      
      // 모델 위치 설정 (스케일 적용 후)
      console.log(`${placedObj.name} Store 좌표: (${placedObj.position.x}, ${placedObj.position.y})`)
      
      // TV는 바닥에 붙어있어야 하므로 y=0으로 설정
      const isTV = placedObj.category === 'av'
      const pos3D = {
        x: placedObj.position.x,     // Store X → 3D X
        y: isTV ? 0 : placedObj.height / 2,  // TV는 바닥에, 다른 오브젝트는 중심에
        z: placedObj.position.y      // Store Y → 3D Z (벽과 동일)
      }
      
      console.log(`${placedObj.name} 3D 최종 위치: (${pos3D.x}, ${pos3D.y}, ${pos3D.z})`)
      console.log(`참고: 방 중앙은 (0, 0, 0)이어야 함`)
      
      model.position.set(pos3D.x, pos3D.y, pos3D.z)
      
      // 모델 회전 설정 (Y축 수직 회전 - 서있는 상태 유지)
      console.log(`🔄 ${placedObj.name} 회전 설정: ${placedObj.rotation} 라디안 (${(placedObj.rotation * 180 / Math.PI).toFixed(1)}도)`)
      console.log(`🔄 Z축 회전(기울임) → Y축 회전(수직상태 좌우회전)으로 수정`)
      
      // Y축 회전 = 수직축 중심 좌우 회전 (오브젝트가 서있는 상태 유지)
      const rotationValue = placedObj.rotation
      const testNegative = true // 2D와 3D 방향 맞추기
      
      if (testNegative) {
        console.log(`🔄 Y축 음수 회전: ${-rotationValue} 라디안 (서있는 상태 유지)`)
        model.rotation.y = -rotationValue
      } else {
        console.log(`🔄 Y축 정방향 회전: ${rotationValue} 라디안 (서있는 상태 유지)`)
        model.rotation.y = rotationValue
      }
      
      console.log(`✅ ${placedObj.name} Y축 수직 회전 적용 완료 (기울임 없음)`)
      
      // 메타데이터 설정
      model.userData = {
        type: 'placed-object',
        placedObjectId: placedObj.id,
        objectName: placedObj.name,
        category: placedObj.category,
        height: placedObj.height, // 높이 정보 추가
        boxId: placedObj.boxId // 상자 ID 정보 추가
      }
      
      console.log(`🔍 Scene 추가 전 children 수: ${scene.children.length}`)
      console.log(`🔍 모델 최종 위치: (${model.position.x}, ${model.position.y}, ${model.position.z})`)
      console.log(`🔍 모델 최종 회전: (${model.rotation.x}, ${model.rotation.y}, ${model.rotation.z})`)
      console.log(`🔍 모델 최종 스케일: (${model.scale.x}, ${model.scale.y}, ${model.scale.z})`)
      
      scene.add(model)
      
      console.log(`🔍 Scene 추가 후 children 수: ${scene.children.length}`)
      console.log(`🔍 Scene children 타입들:`, scene.children.map(child => child.userData?.type || child.type))
      console.log(`=== ✅ ${placedObj.name} 3D 씬에 추가 완료! ===`)
      
    } catch (error) {
      console.error(`❌ GLB 모델 로딩 실패 (${placedObj.name}):`, error)
      
      // 상자인 경우 특별한 3D 상자 모델 생성
      if (placedObj.category === 'etc' && placedObj.isOnBox) {
        create3DBox(placedObj, extractedColor)
      } else {
        // 오류 시 기본 큐브로 대체
        const fallbackGeometry = new THREE.BoxGeometry(placedObj.width, placedObj.height, placedObj.depth)
        const fallbackMaterial = new THREE.MeshStandardMaterial({ 
          color: extractedColor || '#ff0000' // 빨간색으로 오류 표시
        })
        const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial)
        fallbackMesh.position.set(placedObj.position.x, placedObj.height / 2, placedObj.position.y)
        fallbackMesh.userData = {
          type: 'placed-object',
          placedObjectId: placedObj.id,
          objectName: placedObj.name + ' (오류)',
          category: placedObj.category,
          height: placedObj.height, // 높이 정보 추가
          boxId: placedObj.boxId // 상자 ID 정보 추가
        }
        scene.add(fallbackMesh)
        console.log(`${placedObj.name} 오류로 인해 기본 큐브로 대체됨`)
      }
    }
  }
}

// 3D 상자 모델 생성
const create3DBox = (placedObj: any, color: string) => {
  console.log(`📦 3D 상자 생성: ${placedObj.name}`)
  
  // 파스텔 연한 갈색 색상 설정
  const pastelBrown = '#E6D5AC' // 파스텔 연한 갈색
  
  // 상자 본체 (바닥과 벽만, 뚜껑 없음)
  const boxGeometry = new THREE.BoxGeometry(placedObj.width, placedObj.height, placedObj.depth)
  const boxMaterial = new THREE.MeshStandardMaterial({ 
    color: pastelBrown,
    transparent: true,
    opacity: 0.9
  })
  const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial)
  
  // 상자 그룹 생성 (뚜껑 없이)
  const boxGroup = new THREE.Group()
  boxGroup.add(boxMesh)
  
  // 위치 설정
  boxGroup.position.set(placedObj.position.x, placedObj.height / 2, placedObj.position.y)
  
  // 회전 적용
  boxGroup.rotation.y = placedObj.rotation || 0
  
  // 메타데이터 설정
  boxGroup.userData = {
    type: 'placed-object',
    placedObjectId: placedObj.id,
    objectName: placedObj.name,
    category: placedObj.category,
    isBox: true,
    boxId: placedObj.id,
    height: placedObj.height // 높이 정보 추가
  }
  
  scene.add(boxGroup)
  console.log(`✅ 3D 상자 생성 완료: ${placedObj.name} (색상: ${pastelBrown}, 뚜껑 없음)`)
}

// 상자 위 오브젝트 배치 처리
const handleObjectsOnBoxes = () => {
  console.log('📦 상자 위 오브젝트 배치 처리 시작')
  
  // Store에서 상자와 모든 오브젝트 정보 가져오기
  const storeObjects = floorplanStore.placedObjects
  const boxes = storeObjects.filter(obj => obj.category === 'etc' && obj.isBox) // 상자는 isBox가 true
  const allObjects = storeObjects.filter(obj => !obj.isBox) // 상자가 아닌 모든 오브젝트
  
  console.log(`📦 Store에서 발견된 상자 개수: ${boxes.length}`)
  console.log(`📦 Store에서 발견된 모든 오브젝트 개수: ${allObjects.length}`)
  console.log('📦 Store의 모든 오브젝트:', storeObjects.map(obj => ({
    name: obj.name,
    category: obj.category,
    isBox: obj.isBox,
    isOnBox: obj.isOnBox,
    boxId: obj.boxId
  })))
  
  // 3D 씬에서 해당 오브젝트들을 찾아서 위치 조정
  boxes.forEach(boxData => {
    console.log(`📦 상자 처리: ${boxData.name}, ID: ${boxData.id}`)
    
    // 3D 씬에서 상자 오브젝트 찾기
    const box3D = scene.children.find(child => 
      child.userData?.type === 'placed-object' && 
      child.userData?.placedObjectId === boxData.id
    )
    
    if (!box3D) {
      console.log(`❌ 3D 씬에서 상자를 찾을 수 없음: ${boxData.name}`)
      console.log('🔍 3D 씬의 모든 오브젝트:', scene.children.map(child => ({
        type: child.userData?.type,
        placedObjectId: child.userData?.placedObjectId,
        objectName: child.userData?.objectName
      })))
      return
    }
    
    const boxPosition = box3D.position
    const boxHeight = boxData.height || 1.0
    const boxWidth = boxData.width || 1.0
    const boxDepth = boxData.depth || 1.0
    
    console.log(`📦 상자 3D 위치: (${boxPosition.x}, ${boxPosition.y}, ${boxPosition.z}), 크기: ${boxWidth}x${boxHeight}x${boxDepth}`)
    
    // 상자와 겹치는 모든 오브젝트 찾기
    const overlappingObjects = allObjects.filter(objData => {
      // 2D 평면에서 겹침 검사 (X, Z 좌표)
      const objX = objData.position.x
      const objZ = objData.position.y // Store의 Y가 3D의 Z
      const objWidth = objData.width || 1.0
      const objDepth = objData.depth || 1.0
      
      // 상자와 오브젝트의 경계 계산
      const boxLeft = boxData.position.x - boxWidth / 2
      const boxRight = boxData.position.x + boxWidth / 2
      const boxTop = boxData.position.y - boxDepth / 2
      const boxBottom = boxData.position.y + boxDepth / 2
      
      const objLeft = objX - objWidth / 2
      const objRight = objX + objWidth / 2
      const objTop = objZ - objDepth / 2
      const objBottom = objZ + objDepth / 2
      
      // 겹침 검사
      const overlapsX = !(objRight < boxLeft || objLeft > boxRight)
      const overlapsZ = !(objBottom < boxTop || objTop > boxBottom)
      
      const isOverlapping = overlapsX && overlapsZ
      
      if (isOverlapping) {
        console.log(`📦 ${objData.name}이 상자 ${boxData.name}와 겹침: (${objX}, ${objZ}) vs (${boxData.position.x}, ${boxData.position.y})`)
      }
      
      return isOverlapping
    })
    
    console.log(`📦 상자 ${boxData.name}와 겹치는 오브젝트 ${overlappingObjects.length}개 발견`)
    
    overlappingObjects.forEach(objData => {
      // 3D 씬에서 해당 오브젝트 찾기
      const obj3D = scene.children.find(child => 
        child.userData?.type === 'placed-object' && 
        child.userData?.placedObjectId === objData.id
      )
      
      if (!obj3D) {
        console.log(`❌ 3D 씬에서 오브젝트를 찾을 수 없음: ${objData.name}`)
        console.log('🔍 3D 씬의 모든 오브젝트:', scene.children.map(child => ({
          type: child.userData?.type,
          placedObjectId: child.userData?.placedObjectId,
          objectName: child.userData?.objectName
        })))
        return
      }
      
      const objHeight = objData.height || 1.0
      
      // TV는 바닥에 붙어있는 오브젝트이므로 상자 위에 배치할 때는 높이를 조정
      const isTV = objData.category === 'av'
      let newY
      
      if (isTV) {
        // TV는 상자 위에 바로 놓기 (TV의 높이를 고려하지 않음)
        newY = boxPosition.y + boxHeight / 2
        console.log(`📺 TV ${objData.name}을 상자 위에 바로 배치: Y=${newY} (상자높이:${boxHeight})`)
      } else {
        // 다른 오브젝트는 기존 로직 유지
        newY = boxPosition.y + boxHeight / 2 + objHeight / 2
        console.log(`📦 ${objData.name}을 상자 위로 이동: Y=${newY} (상자높이:${boxHeight}, 오브젝트높이:${objHeight})`)
      }
      
      obj3D.position.y = newY
      
      // 상자의 회전도 오브젝트에 적용
      if (box3D.rotation) {
        obj3D.rotation.y = box3D.rotation.y
      }
      
      console.log(`📦 ${objData.name}을 상자 위로 이동: Y=${newY} (상자높이:${boxHeight}, 오브젝트높이:${objHeight})`)
    })
  })
  
  console.log('✅ 상자 위 오브젝트 배치 처리 완료')
}

// Store를 사용한 Make3D - 2D 객체들을 상세한 3D로 변환
const make3D = async () => {
  if (loading.value) return
  
  loading.value = true
  
  try {
    const data = floorplanStore.floorplanData
    console.log('🏗️ Make3D 시작 - Store 데이터:', data)
    console.log('📦 배치된 오브젝트 개수:', data.placedObjects?.length || 0)
    console.log('📦 배치된 오브젝트 목록:', data.placedObjects)

    if (!data || !data.roomSize) {
      console.log('❌ Make3D 중단: 방 데이터 없음')
      return
    }

    if ((!data.exteriorWalls || data.exteriorWalls.length === 0) && 
        (!data.interiorWalls || data.interiorWalls.length === 0)) {
      console.log('❌ Make3D 중단: 벽 데이터 없음')
      return
    }

    console.log('🧱 벽 생성 중...')
    create3DWalls(data)
    
    console.log('📦 오브젝트 생성 시작...')
    await create3DObjects(data.placedObjects || [])
    
    console.log('📦 상자 위 오브젝트 배치 처리...')
    handleObjectsOnBoxes()
    
    console.log('✨ 추가 3D 기능 적용...')
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
  
      // GLB 원본 색상 보존을 위해 추가 조명 제거
    // addEnhancedLighting(roomCenterX, roomCenterZ, roomWidth, roomDepth)
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
    'room-light', 'corner-light', 'wall-decoration', 'placed-object'
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

// Store 변경 감지 - 배치된 오브젝트 실시간 동기화 (무한루프 방지)
let isUpdating = false // 업데이트 중 플래그
watch(
  () => floorplanStore.placedObjects,
  async (newObjects, oldObjects) => {
    if (!scene || !renderer || !camera || isUpdating) return
    
    // 실제 개수나 ID 변경만 감지 (위치, 회전 변경 시에만 실행)
    const oldLength = oldObjects?.length || 0
    const newLength = newObjects?.length || 0
    
    if (oldLength === newLength && oldObjects && newObjects) {
      // 개수가 같으면 위치나 회전 변경인지 확인
      const hasPositionChange = newObjects.some((newObj, index) => {
        const oldObj = oldObjects[index]
        return oldObj && (
          Math.abs(newObj.position.x - oldObj.position.x) > 0.001 ||
          Math.abs(newObj.position.y - oldObj.position.y) > 0.001 ||
          Math.abs(newObj.rotation - oldObj.rotation) > 0.001
        )
      })
      
      if (!hasPositionChange) {
        console.log('🔄 색상 등 무시할 수 있는 변경 - 3D 업데이트 스킵')
        return
      }
    }
    
    isUpdating = true
    console.log('🔄 Store placedObjects 변경 감지 - 3D 동기화 시작')
    console.log(`📊 오브젝트 개수 변화: ${oldLength} → ${newLength}`)
    
    // 삭제된 오브젝트 추적
    if (newLength < oldLength) {
      console.log('🗑️ 오브젝트 삭제 감지!')
      console.log('🗑️ 이전 오브젝트들:', oldObjects?.map(obj => obj.id))
      console.log('🗑️ 현재 오브젝트들:', newObjects?.map(obj => obj.id))
    }
    
    try {
      // 실시간 3D 업데이트
      await updatePlacedObjectsIn3D(newObjects || [])
      console.log('✅ 3D 오브젝트 동기화 완료')
    } finally {
      isUpdating = false
    }
  },
  { deep: true, immediate: false }
)

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